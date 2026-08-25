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
  url         String   @db.VarChar(512)
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

**Reactions are revealed-only**: the API rejects reactions on posts with `status = 'active'`. Layer this in the service, not the schema — DB doesn't care.

**Comments similarly**: only on revealed posts.

---

### 2.11 `notifications`

```prisma
model Notification {
  id            String   @id @default(uuid()) @db.Uuid
  userId        String   @db.Uuid
  type          String   @db.VarChar(40)   // 'invite' | 'results_available' | 'reaction' | 'comment' | 'report_resolved'
  actorId       String?  @db.Uuid          // who triggered it (null for system)
  targetType    String?  @db.VarChar(20)   // 'post' | 'comment' | 'group' | 'report'
  targetId      String?  @db.Uuid
  payload       Json?     // arbitrary extra data
  readAt        DateTime?
  createdAt     DateTime @default(now()) @db.Timestamptz(6)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, readAt, createdAt DESC])    // notifications tab queries
  @@map("notifications")
}
```

**Payload as Json**: keeps the schema flexible without bloating the column set. We always read it as a typed interface in the service layer.

---

### 2.12 `reports`

```prisma
model Report {
  id          String   @id @default(uuid()) @db.Uuid
  reporterId  String   @db.Uuid
  targetType  String   @db.VarChar(20)   // 'post' | 'comment' | 'user'
  targetId    String   @db.Uuid
  postId      String?  @db.Uuid          // denormalised for admin queue query
  reason      String   @db.VarChar(40)   // 'spam' | 'harassment' | 'violence' | 'false_info'
  details     String?  @db.VarChar(1000)
  status      String   @default("open")  // 'open' | 'reviewing' | 'resolved' | 'dismissed'
  resolvedById String?  @db.Uuid
  resolvedAt  DateTime?
  createdAt   DateTime @default(now()) @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt @db.Timestamptz(6)

  reporter    User  @relation("reporter", fields: [reporterId], references: [id], onDelete: Cascade)
  post        Post? @relation("reportedPost", fields: [postId], references: [id], onDelete: SetNull)
  resolvedBy  User? @relation("reportResolver", fields: [resolvedById], references: [id], onDelete: SetNull)

  @@index([status, createdAt])                  // admin queue
  @@index([targetType, targetId])               // count reports against a target
  @@index([reporterId, createdAt])              // "my reports"
  @@map("reports")
}
```

**Why `postId` denormalised**: 90 % of reports target a post. The admin queue is essentially a `reports WHERE postId IN (…)` query with the post rendered. Denormalising avoids a join in the hottest query.

---

### 2.13 `admin_actions`

```prisma
model AdminAction {
  id        String   @id @default(uuid()) @db.Uuid
  adminId   String   @db.Uuid
  action    String   @db.VarChar(40)   // 'dismiss_report' | 'warn_user' | 'delete_post' | 'ban_user' | 'unban_user'
  targetType String  @db.VarChar(20)
  targetId   String  @db.Uuid
  metadata   Json?
  createdAt  DateTime @default(now()) @db.Timestamptz(6)

  admin User @relation("adminActor", fields: [adminId], references: [id], onDelete: Restrict)

  @@index([adminId, createdAt])
  @@index([targetType, targetId])   // audit trail per target
  @@map("admin_actions")
}
```

**Append-only**. No `updated_at`. Audit logs are immutable.

---

### 2.14 `contact_hashes` (privacy-safe contact sync)

```prisma
model ContactHash {
  userId      String   @db.Uuid
  phoneHash   String   @db.VarChar(64)
  createdAt   DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([userId, phoneHash])
  @@index([phoneHash])                   // intersect with contacts uploaded by other users
  @@map("contact_hashes")
}
```

When a user uploads their phone's contact list (for "Select Contacts"), the mobile app:

1. Normalises each contact to E.164.
2. Hashes each with `sha256(installSalt + phone)`.
4. Sends the hash list to the backend.

The backend:

1. Re-hashes with `sha256(serverPepper + phone)` … wait, this doesn't work directly. We need a deterministic cross-domain hash. The way we resolve this:
   - Mobile sends `{ installSalt, hashedNumbers[] }` (where each `hashedNumber = sha256(installSalt + phone)`).
   - Backend stores each as `ContactHash(userId, phoneHash)` — but the **server can't re-derive the user's own installSalt + phone** to match against `users.phoneHash`.
2. The cleaner approach: server sends back **the user's installSalt** as part of signup, encrypted at rest. The mobile app uses that single salt for all hashes. The server, on receipt of a hash, checks if `sha256(serverPepper + recoverServerSide)` matches any `users.phoneHash`.

Actually the simpler, cleaner model is what we'll use (and which is in the backend doc):

- **`users.phone_hash = sha256(serverPepper + phone)`** — deterministic, owned by server.
- **Contact sync**: mobile sends hashes of `sha256(installSalt + phone)`. Server checks if **anyone's phone_hash matches**. But the salts differ, so they won't match.

OK — there's a real design wrinkle here. The cleanest privacy-preserving intersect is:

- On signup, the server returns `serverPepper + (installSalt)` to the client, encrypted in transit.
- Client uses `serverPepper + phone` for contact hashes.
- Client sends `{ hashedNumbers: sha256(serverPepper + phone)[] }` to server.
- Server intersects `hashedNumbers` against `users.phone_hash` directly.

We persist this single salt on the user record as `users.contact_salt` (rotated on password reset, etc.). **Update to the user schema:**

```prisma
model User {
  // ...existing fields...
  contactSalt  String   @db.VarChar(64)   // per-user, sent to client on auth, used for contact hashing
}
```

Then:

- **ContactHash becomes a join table** of "I've seen user X" for the user who uploaded contacts. For MVP we don't even need to persist it; we return the matched users immediately and discard. So **drop the `contact_hashes` table** for v1 and recompute on every sync.

I'll flag this in the roadmap as a deliberate simplification for MVP, with the table ready in the schema if we later want to cache.

---

## 3. Index strategy (the query paths we care about)

| Query | Index used |
| --- | --- |
| `users.findUnique({ phone })` | unique on `phone` |
| Contact intersect `users WHERE phone_hash IN (…)` | unique on `phone_hash` |
| Feed: `posts WHERE status='revealed' ORDER BY created_at DESC LIMIT 20` | `(status, created_at DESC)` |
| Group feed: `posts WHERE group_id = ? ORDER BY created_at DESC` | `(group_id, created_at DESC)` |
| My pending invites: `group_invites WHERE invitee_id = ? AND status = 'pending'` | `(invitee_id, status)` |
| Reveal job: `posts WHERE status='active' AND discussion_meta.reveal_ends_at <= now()` | `(revealEndsAt, revealedAt)` on `discussion_meta` + `posts.id = discussion_meta.post_id` |
| Notifications: `notifications WHERE user_id = ? AND read_at IS NULL ORDER BY created_at DESC` | `(user_id, read_at, created_at DESC)` |
| Admin queue: `reports WHERE status = 'open' ORDER BY created_at` | `(status, created_at)` |

Composite indexes ordered by **equality first, then range, then sort**. This is the textbook order for Postgres.

---

## 4. Foreign keys & cascade behaviour (cheat sheet)

| Relation | On delete | Why |
| --- | --- | --- |
| `posts.authorId → users.id` | `Cascade` | post deleted when user deleted (rare, admin action) |
| `posts.groupId → groups.id` | `Restrict` | post outlives group |
| `group_members.userId → users.id` | `Cascade` | membership ends when user leaves (any way) |
| `group_members.groupId → groups.id` | `Cascade` | membership ends when group deleted |
| `group_invites.* → users/groups` | `Cascade` | invite disappears with either side |
| `responses.postId → posts.id` | `Cascade` | post delete clears responses |
| `responses.authorId → users.id` | `Cascade` | user delete clears responses |
| `reactions.postId/userId` | `Cascade` | symmetric with responses |
| `comments.postId/authorId` | `Cascade` | symmetric |
| `notifications.userId` | `Cascade` | user delete clears notifications |
| `refresh_tokens.userId` | `Cascade` | log out everywhere on user delete |
| `media.uploaderId` | `Cascade` | delete uploads with user |
| `reports.postId` | `SetNull` | post can be deleted; report history stays |
| `reports.resolvedById` | `SetNull` | admin identity preserved |
| `admin_actions.adminId` | `Restrict` | cannot delete admin history; demote instead |

---

## 5. The reveal job (cron-style, no separate worker)

Postgres can run a periodic function via `pg_cron` (extension). Every minute:

```sql
UPDATE posts p
SET status = 'revealed', updated_at = now()
FROM discussion_meta m
WHERE p.id = m.post_id
  AND p.status = 'active'
  AND m.reveal_ends_at <= now()
  AND m.revealed_at IS NULL;

UPDATE discussion_meta
SET revealed_at = now()
WHERE reveal_ends_at <= now()
  AND revealed_at IS NULL;

-- notify affected users
INSERT INTO notifications (user_id, type, target_type, target_id)
SELECT gm.user_id, 'results_available', 'post', p.id
FROM posts p
JOIN discussion_meta m ON m.post_id = p.id
JOIN group_members gm ON gm.group_id = p.group_id
WHERE m.revealed_at >= now() - interval '1 minute'
ON CONFLICT DO NOTHING;
```

The 1-minute window is intentional — `pg_cron` may run slightly late, so we don't double-fire but also don't miss anyone. Notifications dedupe via the unique-ish logic above (we may insert duplicates per post per user; that's OK because the UI dedupes).

This is the kind of "background job" we explicitly want to keep inside Postgres rather than spawning a Node worker. It runs in the same transaction as the state change, and Postgres's MVCC guarantees we don't reveal twice.

---

## 6. Query optimisations (the patterns we'll bake in)

1. **Cursor pagination, never OFFSET**. `WHERE (created_at, id) < (?, ?) ORDER BY created_at DESC, id DESC LIMIT 20`. Stable under inserts; no skipping rows.
2. **Select only what's needed**. List endpoints return `select` projections, not full Prisma models. Document this in service-layer comments.
3. **`include` vs `select` discipline**: `include` for endpoints that return relations; `select` for list endpoints. Never both on the same query.
4. **Batch fetches for N+1**. If we render 20 posts with author + group + media count, use one `findMany` with `include` rather than per-row queries. Prisma does this automatically when relations are properly declared.
5. **Composite indexes for sort+filter**. See §3.
6. **JSONB only when the shape is genuinely variable**. We use Json for `notifications.payload` and `admin_actions.metadata`. Everywhere else, columns are first-class.
7. **No count(*) for "is there more"**. Cursor pagination returns `hasMore: boolean` derived from `LIMIT+1` — never run a COUNT.
8. **`EXPLAIN ANALYZE` every new query path** during code review, at least once, in dev. Prisma logs queries in dev with `--log-queries`.

---

## 7. Migrations — how we'll operate

- Each migration is a separate file under `prisma/migrations/`. Generated by `prisma migrate dev`.
- Naming: `YYYYMMDDHHMMSS_short_description`. We never edit applied migrations.
- For destructive changes: add a new migration that does both the data backfill and the schema change. Never drop a column in the same migration as a backfill.
- `prisma migrate deploy` is what CI runs, never `migrate dev`.

---

## 8. Edge cases — schema-level

| Case | Handling |
| --- | --- |
| Phone format change (Google metadata update) | `phoneHash` is a derived value; we never store the raw phone unencrypted, so a hash mismatch on existing users is fine. |
| Group with all members removed | Allowed to exist; future posts will fail because invites can't be accepted. |
| Post with no media | `PostMedia` empty; nothing to cascade. |
| Discussion timer set to 0 | Service rejects before insert. |
| Reveal already happened, user sends a response | Service checks `status = 'active'` before insert. |
| Two responses by the same user at the same instant | Allowed (no unique constraint on `(postId, authorId)`) — first wins; second is treated as edit (v2). |
| Media uploaded but never attached | Periodic cleanup job deletes orphans older than 24 h. |
| Admin demoted mid-session | `isAdmin` flipped on next request; JWT doesn't carry `isAdmin`, every admin endpoint checks the DB. |
| User changes phone (v2) | New `phone` row created via `?`; old row soft-handled. Out of scope for MVP. |

---

## 9. What this schema does NOT have (deliberate omissions)

- **No `hashtags` table.** Hashtags / search ranking is v2.
- **No `stories` table.** Story *viewing* uses a simple cached response from `users` + recent posts; full story authoring is v2.
- **No `devices` / push tokens.** Push is v2; we'd add `device_tokens` then.
- **No `audit_log` for general user actions.** Only `admin_actions` — per-action audit logs are overkill for MVP.
- **No `passwords`.** Phone-OTP only.
- **No `email`.** Email sign-in is v2.
- **No soft-delete (`deleted_at`) on most tables.** Only `posts.deletedAt` (for moderation) and `comments.deletedAt` (so we can hide a comment while preserving thread structure) and `responses.deletedAt` (same reason). Everywhere else, hard delete is fine.

---

## 10. The "DRY" pass — what's reused

- **UUID primary keys** everywhere. Not auto-increment — UUIDs let us generate client-side IDs without round-tripping, and they don't leak row counts.
- **Composite PKs on join tables** (`group_members`, `reactions`, `post_media`) instead of surrogate `id`. This is the textbook DRY: the join table's identity IS the (left, right) pair; adding an `id` column is noise.
- **Single `createdAt` / `updatedAt` convention** applied uniformly. Migrations don't need bespoke audit columns.
- **Single `Json` column for variable payloads** (`notifications.payload`, `admin_actions.metadata`) — instead of a wide table of mostly-null columns.

---

## 11. The first migration file

Existing migration `20260823184814_init` creates the `users` table. The full schema migration sequence for v1 will be:

1. **M1 — Auth** (`users`, `refresh_tokens`, `user_settings`)
2. **M2 — Groups** (`groups`, `group_members`, `group_invites`)
3. **M3 — Posts + Discussion** (`posts`, `discussion_meta`, `media`, `post_media`)
4. **M4 — Responses + Reactions + Comments** (`responses`, `response_media`, `reactions`, `comments`)
5. **M5 — Notifications + Reports + Admin** (`notifications`, `reports`, `admin_actions`)

Each migration is small, reviewable, and reversible in a code-review sense (apply, roll back, re-apply). This is how a small team moves fast without losing the plot.