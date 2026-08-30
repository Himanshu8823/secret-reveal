# SECRET-REVEAL — Master Flow Plan (Client-Aligned)

> **Status:** Planning only — no code. This doc is the single source of truth for the next implementation phase.
> **Author:** Muse Spark planning pass, 2026-08-31, based on client voice note (Hinglish transcript) + 2 thread UI refs + codebase audit.
> **Supersedes:** For create-post + reveal + groups flow, this doc wins over `01-MASTER-PRD.md` sections 3.3 / 3.4. Conflict is flagged here (see §1).

---

## 1. What client asked — verbatim flow (translated, not re-imagined)

> "bhool jao jo humara hai, mere point of view se socho"

Client's mandated flow (exact order):

1. **Create Post — Step 1 (Caption + Attachments + Interaction Types)** — same page
2. **Timer Settings** — Step 2
3. **Group Screen (2 tabs)** — Step 3, then Publish
4. **Invite accept/reject** — post-publish lifecycle
5. **Post detail (after publish)** — click post → detail with interactions

Anything not in this flow (stories, plugins, queues) is out of scope until needed. YAGNI.

---

## 2. Step 1 — Create Post: Caption, Attachments, Interaction Types

### 2.1 Layout — single screen

```
┌─────────────────────────────────┐
│ ← Create Post          [Next]   │
├─────────────────────────────────┤
│ Text input (multiline)          │
│ "What do you want to discuss?"  │
│ 180px min, 2000 max, counter    │
├─────────────────────────────────┤
│ Attachments  [1..5]  (4-per-row)│
│ [Image] [Video] [Audio] [More/File] │
│ Selected thumbs with X, +Add    │
│ Error: "Max 5 attachments"      │
├─────────────────────────────────┤
│ ── Comment Type ──              │
│ [ Yes/No ] [Text] [Reaction]    │
│ [ Rating ] [ Like ]             │
│ Helper: mutually-exclusive hint │
└─────────────────────────────────┘
```

### 2.2 Attachments — rules

- **Min 0, Max 5**, enforced client (composerStore) + server (zod).
- Not Instagram/WhatsApp: attachments are supporting evidence, not the post. No filters, no story ring.
- Types: `image/*`, `video/*`, `audio/*`, `application/pdf` (More). Each via S3 pre-signed (Phase 3b); v1 keeps inert placeholder but validates count.
- Order matters — `PostMedia.order` already exists.
- UI: 4-per-row grid, same as current `MEDIA_OPTIONS`. Change: wire real picker (expo-image-picker / document-picker) but keep same icons.

### 2.3 Interaction Types — the 5 kinds (same page, below attachments)

| # | Key | Label on UI | What responder does |
|---|-----|-------------|---------------------|
| 1 | `yesNo` | Yes / No | Binary poll (2 buttons) |
| 2 | `textComment` | Text comment | Free-text (up to 1000) |
| 3 | `reaction` | Reaction | **Any emoji** — picker with full emoji set, single emoji per reaction (user picks one) |
| 4 | `rating` | Rating | **1–5 or 1–10** — poster **must pick scale** at creation (segmented control 5 / 10) |
| 5 | `like` | Like | Single heart toggle |

**Composition rules (client + server enforced):**

- `like` → can combine with **any** (no restriction).
- `textComment` → can combine with **any**.
- `reaction` → can combine with **any**.
- `yesNo` ⟷ `rating` → **mutually exclusive** — never together.
- Valid sets examples:
  - `[]` not allowed — at least 1 type required.
  - `[like]`, `[like, textComment]`, `[reaction, like]`, `[yesNo, like, textComment]`, `[rating(1-5), like]` → ok
  - `[yesNo, rating]` → **reject** (zod error code `INTERACTION_CONFLICT`)
  - Single, 2, or all 5 minus the conflict pair — allowed.

**UI:** chip multi-select, conflict pair disables the other with hint text: `"Rating and Yes/No can't be used together"`. Store as `interactionTypes: InteractionType[]` + `ratingScale?: 5|10` (only when rating selected).

**Backend impact:** current schema has `Reaction` (like/love/laugh) + `Response` (text) + `Comment` (meta) but no `yesNo`/`rating` persistence. Need new model(s) — see §7. Do NOT overload Response.body for voting.

### 2.4 State — composerStore extension

```ts
// mobile/src/store/composerStore.ts
type InteractionType = 'yesNo' | 'textComment' | 'reaction' | 'rating' | 'like';
type ComposerState = {
  caption: string;
  mediaIds: string[];        // max 5
  interactionTypes: InteractionType[];
  ratingScale: 5 | 10 | null; // REQUIRED when rating ∈ interactionTypes; segmented control [5 | 10]
  timerMinutes: number | null;
  groupName: string;
  invitees: Invitee[];
  selectedExistingGroupId: string | null; // for tab 2
  // ...
}
```

Validation helper `validateInteractionTypes(types)` shared between zod (backend) and store (frontend).
- If `rating` ∈ types but `ratingScale` is null → reject `RATING_SCALE_REQUIRED`.
- `reaction` value is any single emoji (not limited to like/love/laugh) — store as unicode string.

---

## 3. Step 2 — Timer Settings (Reveal Timer)

### What it is

- **Not** a "result timer" for results — it's the **hide-until** gate. Title: `"Set Reveal Timer"` or keep `"Set Result Timer"` — copy tweak only.
- Presets: `30m / 1h / 3h / custom (5–1440)` — already implemented in `timer.tsx:25` — keep as-is.
- After this, no data leaves device until groups step. Timer stored in `composerStore.timerMinutes`.

### Strict hiding rule (product-critical, server-enforced)

> "Reveal time tak pata hi nahi chalna chahiye ki comment hua bhi hai — bs khud ka comment dikhega"

- Until `DiscussionMeta.revealEndsAt` passes **and** `Post.status='revealed'`:
  - **No one** can read others' responses/comments/reactions/votes/ratings via any endpoint. Bodies never leave server. Counts also hidden (or show 0) — see decision below.
  - **Exception:** viewer's **own** response/comment/vote — must be visible to the author of that content only. Current backend `listResponses` throws 403 for all during `active` — needs change to allow own-row return, OR separate `myResponse` endpoint. Decision: add `GET /posts/:id/my-response` + filtered `listResponses` that returns only own rows pre-reveal.
  - Every list endpoint already gates on `status === 'active'` → 403. Extend same gate to `yesNoVotes`, `ratings`, `reactions` counts? Reactions: current hides count? Keep but clamp to 0 pre-reveal if strictest interpretation.
- Reveal flips via `revealDuePosts` worker (every 60s) OR manual `POST /posts/:id/reveal`. Worker already invalidates `cache:post:${id}:*`.

**UI during hidden:** post detail shows pill `"Hidden until reveal · 00:34:12"` + empty state `"Responses are hidden — only your response (if any) is visible"` — no leaked counts.

---

## 4. Step 3 — Group Screen (2 Tabs)

### 4.1 Structure

```
┌─────────────────────────────────────────┐
│ ← Select Group               Step 3/3  │
├─────────────────────────────────────────┤
│ [ Create Group | Previous Groups ] tabs │
├─────────────────────────────────────────┤
│ TAB 1: Create Group                     │
│  Group name *  [input]                  │
│  Search users  [input]  (filter list)   │
│  Members list (checkable)               │
│  Selected chips on top                  │
│  [Publish] (bottom fixed)               │
├─────────────────────────────────────────┤
│ TAB 2: Previous Groups                  │
│  Search groups [input] (by name)        │
│  Groups list (radio select, 1 only)     │
│  Selected highlight + check             │
│  [Publish to Group]                     │
└─────────────────────────────────────────┘
```

### 4.2 Tab 1 — Create Group

- **Group name compulsory** — already enforced (`invites.tsx:45`). Keep.
- **Search users** — live filter on `listUsers({ search })` — backend already supports `q` param (verify). Debounced 300ms.
- **Members list** — multi-select, shows avatar initial + name + Add/Added toggle. Bottom shows count.
- **Publish** calls `POST /posts` with `{ memberIds, caption, mediaIds, timerMinutes, groupName, interactionTypes, ratingScale }`.
- **Deduplication:** if same member set `{A,B,C,D}` already exists, **no new group** — post goes into existing group's timeline. This is already correct via `buildMemberSignature` + `memberSignature` unique partial index (`groups.service.ts:192`) + `findOrCreateGroupByMembers`. **Confirmed per client:** keep **purana group name hi rakho**, new group nahi banega — post sidha us existing group mai chali jayegi. Name input in this case is ignored with info toast `"Posting to existing group '...'"`. Log this.

### 4.3 Tab 2 — Existing Groups

- **Search bar at top** — filters `groups:mime` client-side (or server `?q=` if added). Must actually filter by `group.name` — currently `groups.tsx` has no search at all.
- **Groups list** — `listMyGroups` data, rendered as radio list (single-select). Shows member count, last activity.
- **Publish to Group** — calls `POST /posts` with `{ groupId, caption, ... }` (legacy path already in `posts.service.ts:89` — validates membership). Reuses same composer data.
- **State:** `selectedExistingGroupId` in store. Switching tabs clears the other tab's selection? No — preserve but publish uses active tab's value only.

### 4.4 Publish — bottom fixed button

- Enabled only when: caption valid + interactionTypes valid + timer set + (tab1: groupName + ≥1 invitee + dedup check passed) OR (tab2: group selected).
- On success: `invalidateQueries` for `groups:mime`, `posts:feed`, `group:posts`, `users:me:stats`, reset composer, `router.replace('/(app)')`.

---

## 5. Invite Lifecycle — Accept / Reject

### Current state (correct, keep)

- New group creation inserts **only creator** as `GroupMember`; invitees become `GroupInvite(status=pending)` (`groups.service.ts:319`). This matches client ask: until accept, no group data visible.
- Visibility gate: `getGroup` checks `isMember` — non-member gets 403, so pending invitee cannot see posts. Good.
- Groups tab shows pending invites at top with Accept/Reject (`groups.tsx:InviteRow`).

### Required fixes

- **On Accept:** `groupMember.create` + `invite.status=accepted` in transaction — already done. Must also invalidate `groups:mime` + `group:detail` so new group appears without pull.
- **On Reject:** `invite.status=rejected` — already done. No membership.
- **Edge:** if invitee rejects after post published, post remains in group but rejected user never sees it — correct.
- **UX gap:** after creating post to new group, creator sees group immediately; invitees see invite card until accept. Confirm with test.

---

## 6. Bug — Group count always 0

### Observed

> "groups page pe group count sahi nahi — always 0 even if andar post hai"

### Audit

- `groups.tsx:87` count is `groups.length` — that's number of groups, not posts. But `GroupRow` and `GroupSummary.memberCount` (`groups.service.ts:95`) is member count, not post count. No post count is ever returned.
- `listMyGroups` selects only `Group` + `_count.members` — no `_count.posts`. So third metric on Group detail (posts count) would need that.
- `getGroup` also doesn't include `_count.posts`.

### Fix (no over-engineering)

- Add `_count.posts` to both `listMyGroups` and `getGroup` queries. Extend types `GroupSummary { postCount }`, `GroupWithMembers { postCount }`.
- Render where needed: Groups tab subtitle stays as groups count; Group detail header shows `postCount` correctly.
- If `latestPost` is also wanted, add it — but not required for count bug. Keep minimal.

---

## 7. Backend Schema Changes (minimal, not generic)

### 7.1 New interaction persistence

Current `Post` has no column for which interaction types are enabled, nor where to store Yes/No votes or Ratings.

**Option A (chosen — simplest, no new tables):**
```prisma
model Post {
  // ...
  allowedInteractions String[] // e.g. ["yesNo","like","textComment","reaction","rating"]
  ratingScale         Int?     // 5 or 10, REQUIRED when rating ∈ allowedInteractions
}
model YesNoVote {
  postId String @db.Uuid
  userId String @db.Uuid
  value  String @db.VarChar(3) // "yes" | "no"
  createdAt DateTime @default(now())
  @@id([postId, userId])
  @@map("yes_no_votes")
}
model Rating {
  postId String @db.Uuid
  userId String @db.Uuid
  value  Int // 1..5 when ratingScale=5, 1..10 when ratingScale=10
  createdAt DateTime @default(now())
  @@id([postId, userId])
  @@map("ratings")
}
// Reaction already exists — extend `type` to store ANY emoji unicode (e.g. "❤️","😂","🔥","🙏") instead of limited like/love/laugh
model Reaction {
  postId    String   @db.Uuid
  userId    String   @db.Uuid
  type      String   @db.VarChar(20) // now: single emoji unicode, not enum
  createdAt DateTime @default(now())
  @@id([postId, userId])
}
```

- Validation: `allowedInteractions` must satisfy the conflict rule (zod at controller boundary). If `rating` ∈ allowedInteractions, `ratingScale` must be 5 or 10 else `RATING_SCALE_REQUIRED`.
- `reaction` value: any single emoji — validate `value` is single grapheme emoji (use `emoji-regex` or length check), not free text.
- Gate: votes/ratings/reactions hidden until reveal (same as responses/comments), own vote visible pre-reveal if needed.

**Option B (generic interaction table)** — rejected: over-engineering for 5 known types.

### 7.2 DiscussionMeta

No change — `timerMinutes`, `revealEndsAt`, `revealedAt` already there.

### 7.3 Media

Already supports 5 via `PostMedia` — just cap validation.

### 7.4 Migration

Single migration: add columns + 2 tables + index on `postId`.

---

## 8. API Contract (envelope unchanged)

```
POST /api/v1/posts
  body: { caption, mediaIds[0..5], timerMinutes, interactionTypes, ratingScale: 5|10 (required if rating ∈ types), groupName?, memberIds? | groupId? }
  → { data: CreatedPost }  // with allowedInteractions + ratingScale echoed
  errors: INTERACTION_CONFLICT (yesNo+rating), RATING_SCALE_REQUIRED, TOO_MANY_MEDIA ( >5 ), INVALID_REACTION (not single emoji), VALIDATION_FAILED

GET /api/v1/posts/:id
  → { data: PostDetail } with allowedInteractions, ratingScale (5|10), viewerYesNoVote, viewerRating, viewerReaction (emoji string), counts (clamped to 0 pre-reveal if strict)

POST /api/v1/posts/:id/votes        { value:"yes"|"no" }
POST /api/v1/posts/:id/ratings      { value: 1..ratingScale } // validate against post's scale (1-5 or 1-10)
POST /api/v1/posts/:id/reactions    { type: "😂" } // any single emoji, not enum; toggles like before
GET  /api/v1/posts/:id/votes        // hidden until reveal → 403, then aggregated
GET  /api/v1/posts/:id/ratings      // same (aggregated avg + distribution, hidden pre-reveal)
GET  /api/v1/posts/:id/my-vote      // own vote/rating/reaction, allowed pre-reveal
```

All routes `zod` validated at controller, rate-limited, member-gated.

---

## 9. Mobile — IA & Navigation

```
(app)/create/_layout.tsx  → stack with 3 screens, header hidden
  ├─ (app)/create/index.tsx   Step 1 — caption + attachments + interactionTypes
  ├─ (app)/create/timer.tsx   Step 2 — timer (existing, keep)
  └─ (app)/create/groups.tsx  Step 3 — NEW: 2-tab group selector (replaces invites.tsx)
                               Tab 1 = create, Tab 2 = existing
                               Publish lives here only

(app)/post/[id].tsx       → refactored detail (see §10)
(app)/group/[id].tsx      → add postCount fix, skeleton
(app)/groups.tsx          → add search, skeletons, fix count
```

`composerStore` is the single source of truth across steps; `reset()` on publish or dismiss.

---

## 10. Post Detail — Thread UI (Image 1 + Image 2 analysis)

### 10.1 Image 1 — Thread view (reference)

Top: author row (avatar, name, `25m`, Follow), caption block with `1/11` indicator, engagement row (♡1, 💬10, ↻, ↗1), `Top ∨` filter, then comments as nested thread items (avatar, name, timestamp, body with inline emoji, `2/11` etc., action row ♡↩↗).

**What we replicate (with our tokens, not Threads copy):**

```
┌─────────────────────────────────┐
│ [avatar] evelina...  25m  [Follow]│  ← same as PostBody author row
│ Caption (h3 or title)            │
│ (media if any, 16:9)             │
├─────────────────────────────────┤
│ Interaction bar (dynamic)        │  ← NEW: render only enabled types
│  if like:    [♡ Like]            │
│  if yesNo:   [Yes] [No] (pill)   │
│  if rating:  [★★★★★] when 1-5, or [1 2 3 ... 10] when 1-10  │
│  if reaction:[emoji picker — any emoji, not fixed set] │
│  if textComment: composer enabled │
│  counts hidden pre-reveal        │
├─────────────────────────────────┤
│ Response input (hidden hint)      │
│ "Visible to others after timer"  │
├─────────────────────────────────┤
│ Responses / Comments list         │  ← Thread style
│  each row: avatar | name | time  │
│           body (wraps)           │
│           action row: Like Reply │
│  [Top ∨]  [View activity >]      │
└─────────────────────────────────┘
```

### 10.2 Image 2 — Reply composer

Bottom sheet / inline input: `himanshu720120 > Community...`, `Reply to ...` placeholder, action bar: [image][GIF][sticker][music][emoji], `[Add another reply]` + `[Post options]` → `[Post]` button. Keyboard with Grid/GIF/settings/clipboard/emoji/mic row.

**What we replicate:**

```
┌─────────────────────────────────┐
│ ×  Reply              [≡][⋯]    │
├─────────────────────────────────┤
│ [avatar] OP post snippet (dim)   │
├─────────────────────────────────┤
│ [avatar] viewer > context        │
│ Input: "Reply to ..." (multiline)│
│ [🖼][GIF][😊][♪][○]              │
│  [Add another reply]  faint     │
│ [≡ Post options]      [Post]    │
└─────────────────────────────────┘
```

We do **not** need GIF/music for v1 — keep `[Image][Video][Audio]` row but styled like this reply composer (rounded, muted bg). Focus is on replicating the **thread nesting + composer placement**, not extra media pickers.

### 10.3 Reveal gating in this view

- `active` → list shows only viewer's own entry + `"Hidden until 00:12:04"` banner. Others' rows not fetched (403).
- `revealed` → full list, sorted `createdAt asc`, with author names real (not Anonymous).

### 10.4 Design tokens (strict)

- All colors from `colors.ts` — `primary #0B49FA`, `surface.muted #F5F6F8`, `border #E4E5E7`, `text.primary #111111`, etc.
- Radii: `full` avatars/FAB, `md 12` inputs/buttons, `lg 16` cards/sheets.
- No new token — open token PR if needed.

---

## 11. Caching, Invalidation, Staleness — Senior Perspective

### 11.1 Current problems (audit)

- **Spinner everywhere** (`groups.tsx:159`, `post/[id].tsx:230`, `profile/index.tsx`) — feels static, no skeleton.
- **Stale profiles:** `profile/index.tsx` likely uses `staleTime: Infinity` or no `refetchOnFocus` — switch profile tab → old data.
- **Group count 0** — missing `_count.posts` (§6).
- **Invalidation scattered** — `invites.tsx:96` invalidates `groups:mime`, `posts:feed`, `group`, `posts`, `users:me:stats` — good but inconsistent across screens. Some mutations miss `groups:mime`.
- **Per-viewer cache key** (`cache:post:${id}:viewer:${viewerId}` 30s) — correct for reaction leak prevention, but `revealDuePosts` pattern-delete `cache:post:${id}:*` is needed (already done).

### 11.2 Query-key convention (enforce)

```
['groups','mine']                // listMyGroups
['group', groupId]               // getGroup detail
['group', groupId, 'posts']      // listPosts({groupId})
['posts','feed']                 // home feed
['post', postId]                 // getPost
['post', postId, 'responses']    // listResponses
['post', postId, 'comments']     // listComments
['post', postId, 'my-vote']      // own vote
['users','me'] / ['users','me','stats']
['invites','pending']
['users','picker']               // member picker
```

### 11.3 Invalidation map (every mutation must call exactly these)

| Mutation | Invalidate |
|----------|------------|
| `createPost` | `['groups','mine']`, `['posts','feed']`, `['group', groupId, 'posts']`, `['users','me','stats']` |
| `submitResponse` / `createComment` / `vote` / `rate` / `toggleReaction` | `['post', id]`, `['posts','feed']`, `['group', groupId, 'posts']` + `cacheDelPattern` on server |
| `acceptInvite` | `['groups','mine']`, `['invites','pending']`, `['users','me','stats']` |
| `rejectInvite` | `['invites','pending']` |
| `revealPost` | `['post', id]`, `['post', id, 'responses']`, `['posts','feed']`, `['group', groupId, 'posts']` |
| `updateProfile` | `['users','me']`, `['users','me','stats']` |

Never `invalidateQueries({queryKey:['posts']})` broad — use precise keys.

### 11.4 Freshness

- `staleTime: 30_000` for feeds, `60_000` for post detail, `0` for invites (always fresh).
- `refetchOnFocus: true` for lists that user bounces between (groups, invites, profile). Already on groups — add to `profile` and `home`.
- `refetchOnReconnect: true` everywhere.
- Use `placeholderData: keepPreviousData` to avoid flicker on paginated lists.

### 11.5 Offline & optimistic

- No general cache for private data under guessable keys (`AGENTS.md`). Per-viewer keys already satisfy.
- Optimistic update for `toggleReaction`, `vote`, `rating` — update cache immediately, rollback on error.

---

## 12. Skeleton Loading & Smoothness (not spinners)

### 12.1 Replace

- Every `ActivityIndicator` full-screen or `Loading…` text → skeleton.
- **Not** pull-to-refresh spinner — keep `RefreshControl` (`groups.tsx:163`).

### 12.2 Skeleton primitives (new shared)

```
src/components/skeleton/
  Skeleton.tsx          // animated shimmer, bg surface.muted, uses reanimated
  PostCardSkeleton.tsx  // matches PostCard layout: avatar 36 + 2 lines + media 16:9
  GroupRowSkeleton.tsx  // avatar 40 + name + meta
  ProfileSkeleton.tsx   // avatar 64 + 3 stats
```

Tokens: `surface.muted #F5F6F8` base, `border #E4E5E7` shimmer, `motion.fast 120ms` pulse or shimmer slide `220ms`. Use `react-native-reanimated` (already in expo). No new package.

### 12.3 Smoothness subagent — training prompt

> Use this prompt to spin the smoothness/polish subagent:

```
You are the motion & polish subagent for NEXORA mobile. Your job: make every screen feel native, not web.

Constraints:
- Use only tokens in src/theme/{colors,spacing,radius,motion,elevation,typography}. Never invent colors/radii.
- Use reanimated for transitions; avoid LayoutAnimation.
- Every list uses FlashList or FlatList with getItemLayout where possible; windowSize 5.
- Every screen that fetches uses Skeleton (see §12.2), never ActivityIndicator full-screen.
- Every navigation uses expo-router with shared-element-ready cards; add 120ms fade for tab switches.
- Respect `motion.fast 120ms` for taps, `motion.base 220ms` for sheet open, `motion.slow 320ms` for hero.
- Validate: run on iOS simulator, check 60fps with Perf Monitor, no jank on scroll.

You own: skeletons, list virtualization, press feedback (active:opacity-70 already), sheet animations, focus management.
You do NOT own: business logic, API shapes, schema.
```

---

## 13. Profile Staleness Fix

- Ensure `profile/index.tsx` query uses `staleTime: 30_000` (not Infinity) + `useRefreshOnFocus(['users','me'])` + `refetchOnMount: 'always'` or `refetchOnWindowFocus`.
- After `edit.tsx` mutation, invalidate `['users','me']` — already should, audit.
- If avatar upload, optimistic update the `me` cache with new `avatarUrl`.

---

## 14. Security & Limits

- Rate-limit every public endpoint (already per `AGENTS.md`). Add for new `votes/ratings/reactions` routes.
- Validate `ratingScale` is 5 or 10 when `rating` ∈ allowedInteractions else reject; `value` must be 1..5 when scale 5, 1..10 when scale 10.
- Validate `reaction` is single emoji unicode (grapheme check) — reject multi-char text.
- Never log full phone numbers / OTPs — mask as `+91XXXXXX1234`.
- `helmet` + CORS locked to known origins (already).
- Media: 5 files max, 25MB each cap (existing S3 rule).

---

## 15. Image Generation — Post Detail (how it will look)

### Prompt for image model (use exactly, with our tokens)

```
Mobile app screen, 390x844, white background #FFFFFF, 24px page padding.

Top: user row — 36px circular avatar (hash color #0B49FA or #7A4DFF), name 15/600 #111111, "2m ago" 13/400 #B6B9BF, right-side Follow pill (white bg, #0B49FA border, 8px radius).

Below: caption 18/700 #111111, line 24, e.g. "Should we plan a weekend trip?" Then media 16:9 rounded 16px, subtle border #E4E5E7.

Divider hairline #E4E5E7.

Interaction bar (render 3 examples side-by-side in the image's annotation, not on screen):
 - If yesNo: two pills "Yes" / "No", selected = #0B49FA fill white text, unselected = #E8EEFE fill #0B49FA text, 12px radius, 12px pad.
 - If rating: segmented control [5 | 10] at creation, then on detail: 5 stars (★★★★★) when scale 5 vs numbered pills 1-10 when scale 10, same token.
 - If reaction: emoji picker grid with any emoji (😂 ❤️ 🔥 🙏 😮 etc.), selected = #0B49FA ring, unselected = #E8EEFE.

Counts row: "12 responses · 4 reactions" 13/400 #8A8D93, hidden state shows "Hidden until reveal · 00:42:11" in mono 13/600 #0B49FA inside #E8EEFE pill (16px radius).

Composer: rounded 12px card, bg #F5F6F8, inner input "Reply to evelina..." #B6B9BF, bottom row [image][video][music] muted #B6B9BF icons, right circular send #0B49FA with white arrow.

Thread list: each row 28px avatar, name 13/600, timestamp 12/400 #B6B9BF, body 15/400 #111111, action row "Like · Reply" 12/400 #8A8D93. Divider hairline between rows.

Tokens enforced: no new colors, no shadows beyond elevation[1] (0 1 2 rgba 0.06). Style: calm, minimal, not Instagram.
```

Render this as PNG via canvas-design skill when ready — **do not invent new colors** per client rule.

---

## 16. Implementation Phases (do in order, no parallel schema drift)

| Phase | Scope | Owner | Done when |
|-------|-------|-------|-----------|
| **0** | This plan reviewed + approved | client + lead | Doc merged |
| **1** | Backend migration + zod + service for interactions (YesNoVote, Rating), reveal gating for them, postCount fix | backend subagent | Tests green, envelope unchanged |
| **2** | Mobile Step 1 — composerStore + validation + UI for interactionTypes + 5-media picker (mock upload ok) | mobile subagent A | Manual QA: conflict disabled, 6th file blocked |
| **3** | Mobile Step 2+3 — timer (keep) + Groups 2-tab screen with search + dedup verify + publish | mobile subagent A | Create→Existing→Publish flows work |
| **4** | Post detail thread UI + hidden gating + my-vote + reveal | mobile subagent B | Screenshots match Image 1/2 style |
| **5** | Skeletons + staleness + invalidation sweep + smoothness | polish subagent (prompt §12.3) | No spinner full-screen, 60fps, profile fresh |
| **6** | Image generation + docs + E2E manual checklist | lead | PNG checked against tokens |

Each phase commits small, conventional commits, no mixed mobile+backend PR.

---

## 17. Open Questions — RESOLVED (2026-08-31 per client)

1. **Rating scale:** ✅ Poster picks **both options available** — segmented control `[5 | 10]` when `rating` selected. `ratingScale` required when rating is chosen.
2. **Reaction set:** ✅ **Any emoji** allowed — not limited to like/love/laugh. Picker shows full emoji set, single emoji per reaction stored as unicode.
3. **Counts pre-reveal:** hide completely (0) + pill `"Hidden until reveal"` — strictest privacy.
4. **`like` vs `reaction` overlap:** keep both as separate types — `like` = single heart toggle, `reaction` = any emoji — per client ok.
5. **Group name reuse on dedup:** ✅ **Purana group name hi rakho** — no new group, post goes directly into existing group. New name input ignored, toast shows existing group name.

---

## 18. Checklist — Before Coding Starts

- [ ] Client confirms §2.3 interaction naming + conflict rule + rating scale.
- [ ] Client confirms §3 own-comment-visible pre-reveal is wanted (vs fully hidden).
- [ ] Client confirms §4.2 dedup keeps old group name.
- [ ] Design tokens extraction re-checked on real device.
- [ ] No new dependency added without one-line reason (AGENTS.md).

---

*End of plan. Next step: client approval → Phase 1 migration.*
