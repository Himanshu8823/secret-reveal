# NEXORA — Database Schema & Data Model

> **Engine:** PostgreSQL 16 via Prisma 6.
> **Folder:** `D:/secret-reveal/backend/src/prisma/`.
> **Source-of-truth for:** every table, column, index, FK, cascade rule, and the **why** behind each decision.
> **Companion docs:** `01-MASTER-PRD.md` (features), `03-BACKEND-ARCHITECTURE.md` (services), `05-IMPLEMENTATION-ROADMAP.md` (sequence).

---

## 0. Conventions (recap of CLAUDE.md, applied)

- **Snake_case at the DB level**, camelCase in app code (Prisma maps).
- Every model has `created_at` / `updated_at`.
- **No `deleted_at` soft-delete** until a concrete need exists.
- **Migrations only via `prisma migrate dev`**. The migration history is the source of truth.
- All FKs have explicit `ON DELETE` behaviour. Cascade where appropriate, restrict where the relation is load-bearing.

---

## 1. Entity-relationship overview

```
users 1───* posts *───1 groups
users 1───* group_members *───1 groups
groups 1───* group_invites *───1 users
posts 1───1 discussion_meta      (timer state, single source of truth)
posts 1───* post_media *───1 media
posts 1───* responses
posts 1───* reactions
posts 1───* comments
posts 1───* reports
users 1───* notifications
users 1───* refresh_tokens
users 1───* contact_hashes       (server-side hash for contact matching)
users 1───1 user_settings
users 1───* admin_actions        (audit log)
```

**No stories table.** The reference UI showed story rings, but the product direction is groups-first — posts are private to groups. Stories are out of MVP scope.

---

## 2. Core tables (Prisma schema)

### 2.1 `users`

```prisma
model User {
  id           String   @id @default(uuid()) @db.Uuid
  phone        String   @unique @db.VarChar(20)   // E.164, e.g. "+919876543210"
  phoneHash    String   @unique @db.VarChar(64)   // sha256(serverPepper + phone) — used for contact intersect
  name         String?  @db.VarChar(60)
  avatarUrl    String?  @db.VarChar(512)
  isAdmin      Boolean  @default(false)
  isBanned     Boolean  @default(false)
  bannedUntil  DateTime?
  createdAt    DateTime @default(now()) @db.Timestamptz(6)
  updatedAt    DateTime @updatedAt    @db.Timestamptz(6)

  posts            Post[]              @relation("author")
  groupMemberships  GroupMember[]
  sentInvites      GroupInvite[]       @relation("inviter")
  receivedInvites  GroupInvite[]       @relation("invitee")
  responses        Response[]
  reactions        Reaction[]
  comments         Comment[]
  reportsFiled     Report[]            @relation("reporter")
  notifications    Notification[]
  refreshTokens    RefreshToken[]
  contactHashes    ContactHash[]
  settings         UserSettings?
  adminActions     AdminAction[]       @relation("adminActor")

  @@index([phoneHash])                 // contact intersect
  @@index([createdAt])                 // admin user list
  @@map("users")
}
```

**Why `phoneHash` separate from `phone`:** we need to match uploaded contacts against our users without keeping the raw phone on disk unencrypted at rest. `phoneHash` is `sha256(SERVER_PEPPER + phone)`. The server pepper is loaded from env at boot and never written to the DB. To re-derive the hash on rebuild, the pepper would need to come from a backup.

**`isBanned` vs `bannedUntil`:** a permanent ban (`isBanned = true`) vs a temporary one (`bannedUntil > now`). One of them must be true for a ban to be active; we check both at auth time.

---

### 2.2 `user_settings`

```prisma
model UserSettings {
  userId              String  @id @db.Uuid
  darkMode            String  @default("system")  // 'light' | 'dark' | 'system'
  pushEnabled         Boolean @default(true)
  groupInviteNotif    Boolean @default(true)
  resultsAvailableNotif Boolean @default(true)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("user_settings")
}
```

One row per user, lazily created on first settings fetch.

---

### 2.3 `refresh_tokens`

```prisma
model RefreshToken {
  jti        String   @id @db.Uuid
  userId     String   @db.Uuid
  familyId   String   @db.Uuid          // all tokens from same login chain share a family
  isUsed     Boolean  @default(false)
  isRevoked  Boolean  @default(false)
  expiresAt  DateTime @db.Timestamptz(6)
  createdAt  DateTime @default(now()) @db.Timestamptz(6)
  userAgent  String?  @db.VarChar(255)
  ipAddress  String?  @db.VarChar(45)   // IPv6-safe length

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, familyId])
  @@index([expiresAt])                  // cleanup job uses this
  @@map("refresh_tokens")
}
```

**Why `familyId`:** refresh-token rotation creates a new jti each time, but all tokens in a single login chain share one family. If a token from an old family is ever presented again, we revoke the entire family — that's the reuse-detection mechanism from §5.2 of the backend doc.

---

### 2.4 `groups` and `group_members`

```prisma
model Group {
  id          String   @id @default(uuid()) @db.Uuid
  name        String   @db.VarChar(60)
  createdById String   @db.Uuid
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  createdBy User           @relation("groupCreator", fields: [createdById], references: [id], onDelete: Restrict)
  members   GroupMember[]
  invites   GroupInvite[]
  posts     Post[]

  @@index([createdById])
  @@map("groups")
}

model GroupMember {
  groupId  String   @db.Uuid
  userId   String   @db.Uuid
  role     String   @default("member")  // 'member' | 'admin'  (v1 only 'member')
  joinedAt DateTime @default(now())

  group Group @relation(fields: [groupId], references: [id], onDelete: Cascade)
  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([groupId, userId])
  @@index([userId])                     // "groups I'm in" queries
  @@map("group_members")
}
```

**`onDelete: Cascade` on both sides**: if either the group or the user is deleted, the membership row goes with it. `Restrict` on `Group.createdById` because we don't want a group to disappear when its creator leaves — the group lives on, the creator is just demoted (v2).

---

### 2.5 `group_invites`

```prisma
model GroupInvite {
  id          String   @id @default(uuid()) @db.Uuid
  groupId     String   @db.Uuid
  inviterId   String   @db.Uuid
  inviteeId   String   @db.Uuid
  status      String   @default("pending")  // 'pending' | 'accepted' | 'rejected'
  respondedAt DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  group   Group @relation(fields: [groupId], references: [id], onDelete: Cascade)
  inviter User  @relation("inviter", fields: [inviterId], references: [id], onDelete: Cascade)
  invitee User  @relation("invitee", fields: [inviteeId], references: [id], onDelete: Cascade)

  @@unique([groupId, inviteeId])        // one open invite per (group, user)
  @@index([inviteeId, status])          // "my pending invites"
  @@map("group_invites")
}
```

**Unique on `(groupId, inviteeId)`**: prevents sending duplicate invites. Once status is `accepted` or `rejected`, a re-invite creates a new row.

---

### 2.6 `posts`

```prisma
model Post {
  id             String   @id @default(uuid()) @db.Uuid
  authorId       String   @db.Uuid
  groupId        String   @db.Uuid
  caption        String   @db.VarChar(2000)
  status         String   @default("active")  // 'active' | 'revealed' | 'deleted'
  createdAt      DateTime @default(now()) @db.Timestamptz(6)
  updatedAt      DateTime @updatedAt @db.Timestamptz(6)
  deletedAt      DateTime?

  author         User           @relation("author", fields: [authorId], references: [id], onDelete: Cascade)
  group          Group          @relation(fields: [groupId], references: [id], onDelete: Restrict)
  media          PostMedia[]
  discussionMeta DiscussionMeta?
  responses      Response[]
  reactions      Reaction[]
  comments       Comment[]
  reports        Report[]       @relation("reportedPost")

  @@index([groupId, createdAt DESC])                  // group feed
  @@index([authorId, createdAt DESC])                 // profile feed
  @@index([status, createdAt DESC])                   // public feed (status='revealed')
  @@index([createdAt DESC])                           // admin listing
  @@map("posts")
}
```

**Why `status`:** a post moves through states. Created → `active` (hidden discussion phase). Timer ends → `revealed` (public). Author or admin deletes → `deleted` (kept for audit; soft delete is justified here for moderation — we explicitly add it for posts and only posts).

**`onDelete: Restrict` on `groupId`**: posts outlive group deletes in our model. A group can be soft-deleted (v2), but you can't hard-delete a group with posts.

---

### 2.7 `discussion_meta`

```prisma
model DiscussionMeta {
  postId          String   @id @db.Uuid
  timerMinutes    Int      // 30 / 60 / 180 / custom
  revealEndsAt    DateTime @db.Timestamptz(6)
  revealedAt      DateTime?
  revealNotifiedAt DateTime?

  post Post @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@index([revealEndsAt, revealedAt])   // the cron-style reveal job
  @@map("discussion_meta")
}
```

**Why split this from `posts`:** the discussion timer is conceptually separate from the post. Keeping the schema this way makes the reveal job (`UPDATE … SET status='revealed', revealed_at=now() WHERE reveal_ends_at <= now() AND revealed_at IS NULL`) a single targeted UPDATE on `discussion_meta` plus a status flip on `posts`. No JSON columns, no GIN indexes — clean.

**Index `(revealEndsAt, revealedAt)`**: the reveal job is `WHERE revealed_at IS NULL AND reveal_ends_at <= now()`. This composite index makes it an index-only scan.

---

### 2.8 `media` and `post_media`

```prisma
model Media {
  id          String   @id @default(uuid()) @db.Uuid
  uploaderId  String   @db.Uuid
  url         String   @db.VarChar(512)   // S3 URL (multipart upload) — v1.1 may split into key + signed URL
  s3Key       String?  @db.VarChar(512)   // populated once we know the bucket layout
  mimeType    String   @db.VarChar(64)
  sizeBytes   BigInt
  width       Int?
  height      Int?
  durationSec Int?     // audio/video
  createdAt   DateTime @default(now())

  uploader   User        @relation("uploader", fields: [uploaderId], references: [id], onDelete: Cascade)
  postMedia  PostMedia[]
  responseMedia ResponseMedia[]

  @@index([uploaderId, createdAt DESC])
  @@map("media")
}

model PostMedia {
  postId  String @db.Uuid
  mediaId String @db.Uuid
  order   Int    // display order

  post  Post  @relation(fields: [postId], references: [id], onDelete: Cascade)
  media Media @relation(fields: [mediaId], references: [id], onDelete: Cascade)

  @@id([postId, mediaId])
  @@index([mediaId])
  @@map("post_media")
}
```

**S3 storage:** every `Media` row corresponds to one S3 object. The `s3Key` column is populated as the upload completes; `url` is the public-ish URL (the bucket is private; signed URLs are minted on demand for `MediaViewer` — screen 12).

**Lifecycle:** when a `Media` row is deleted (or its owner deleted, cascading), the S3 object is deleted by an S3 lifecycle rule on a `deleted_at` prefix, NOT in real-time. We accept a small window where the object exists but is unreferenced. S3 costs are negligible at our scale.

**`BigInt` for `sizeBytes`**: integer is fine up to ~2 GB but BigInt is safer for paranoia. Prisma returns BigInt for this column.

---

### 2.9 `responses` (the hidden-discussion responses)

```prisma
model Response {
  id          String   @id @default(uuid()) @db.Uuid
  postId      String   @db.Uuid
  authorId    String   @db.Uuid
  body        String   @db.VarChar(2000)
  createdAt   DateTime @default(now()) @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt @db.Timestamptz(6)
  deletedAt   DateTime?

  post   Post            @relation(fields: [postId], references: [id], onDelete: Cascade)
  author User            @relation(fields: [authorId], references: [id], onDelete: Cascade)
  media  ResponseMedia[]

  @@index([postId, createdAt])
  @@map("responses")
}
```

**Visibility is server-side**: even if a client queries `responses` directly via the API, the server checks the post's `discussionMeta.revealEndsAt` and the viewer's membership in `group_members` before returning rows. The DB has no concept of "hidden" — the schema is uniform; the access control is in the service layer.

---

### 2.10 `reactions` and `comments`

```prisma
model Reaction {
  postId    String   @db.Uuid
  userId    String   @db.Uuid
  type      String   @default("like")  // future: 'love', 'insightful', etc.
  createdAt DateTime @default(now())

  post Post @relation(fields: [postId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([postId, userId])          // one reaction per user per post
  @@index([postId])               // count reactions per post
  @@map("reactions")
}

model Comment {
  id        String   @id @default(uuid()) @db.Uuid
  postId    String   @db.Uuid
  authorId  String   @db.Uuid
  body      String   @db.VarChar(1000)
  createdAt DateTime @default(now()) @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @db.Timestamptz(6)
  deletedAt DateTime?

  post   Post  @relation(fields: [postId], references: [id], onDelete: Cascade)
  author User  @relation(fields: [authorId], references: [id], onDelete: Cascade)

  @@index([postId, createdAt])
  @@map("comments")
}
```

**Comments are revealed-only**: the API rejects comments on posts with `status = 'active'`. Same for reactions.

