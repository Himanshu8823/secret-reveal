# NEXORA — Implementation Roadmap & Checklist

> **Source-of-truth for:** the ordered sequence of work, phase gates, definition-of-done per phase.
> **Companion docs:** `00-DESIGN-TOKENS-EXTRACTION.md`, `01-MASTER-PRD.md`, `02-FRONTEND-ARCHITECTURE.md`, `03-BACKEND-ARCHITECTURE.md`, `04-DATABASE-SCHEMA.md`.

---

## How to read this

Every phase ends with a **gate** — a checklist that must be all-green before moving on. Each phase is one PR / one sprint, sized for a small team.

Each task in a phase lists the file(s) it touches and the rough order. The user picks the order; this doc gives the dependency graph.

---

## PHASE 0 — Foundation (1 session)

### 0.1 Install NativeWind (Tailwind for RN)

**Goal:** Tailwind utilities compile and a single throwaway component renders `className="bg-primary rounded-md"`.

**Tasks:**
1. Read the version-research agent's output (in-flight) and pin exact versions.
2. Add deps: `nativewind`, `tailwindcss@^3` (or v4 if the agent confirms v5 supports it), `prettier-plugin-tailwindcss`.
3. Create `mobile/babel.config.js`, `mobile/metro.config.js`, `mobile/tailwind.config.js`, `mobile/global.css`, `mobile/nativewind-env.d.ts`.
4. Update `mobile/tsconfig.json` (`jsxImportSource`, `types`).
5. Wrap root in `app/_layout.tsx` with the NativeWind bootstrap.
6. Smoke test: build a `<Pill />` primitive using only `className`, render it from `app/index.tsx`.

**Gate:**
- [ ] `pnpm tsc --noEmit` clean
- [ ] Expo dev server starts without warnings about NativeWind
- [ ] Pill renders with `bg-pill-infoBg text-info rounded-md px-3 py-1`
- [ ] Hot reload works without Metro cache resets

### 0.2 Phone validation (backend + mobile)

**Goal:** `/^\+[1-9]\d{6,14}$/` is replaced with `libphonenumber-js` on both sides.

**Tasks:**
1. Add `libphonenumber-js` to `backend/package.json`.
2. Replace `backend/src/modules/auth/auth.validation.ts` to use the new schema (see `02-FRONTEND-ARCHITECTURE.md` §9 and the research-agent output).
3. Update `auth.service.requestOtp` to accept `{ countryCode, phoneNumber }` and store `e164`.
4. Add `libphonenumber-js` to `mobile/package.json`.
5. Create `mobile/src/features/auth/phoneValidation.ts` using `libphonenumber-js/min`.
6. Wire `mobile/app/(auth)/login.tsx` to use the new validator (replaces the inline regex). Drop the `Alert.alert` for invalid; show inline error under the input.
7. Add unit tests: `backend/src/modules/auth/auth.service.test.ts` gets cases for valid mobile, valid number but landline (reject), wrong country (reject), disallowed country (reject).

**Gate:**
- [ ] Backend: `pnpm test` passes with the new cases
- [ ] Mobile: login form shows inline error for "12345", "landline-from-IN", "+12025550100" (US while IN selected)
- [ ] E.164 stored in `users.phone` is correctly formatted (`+91...`, never `91...`)

### 0.3 OTP flow (mocked, real-shaped)

**Goal:** OTP flow is real-shaped even with the mock provider, so the Twilio swap is one file.

**Tasks:**
1. Move `otp.provider.ts` content into `backend/src/lib/otp/` directory split into `provider.ts`, `mock.provider.ts`. Keep the `OtpProvider` interface contract.
2. Add JSDoc to `MockOtpProvider.generateOtp()` explaining the random-OTP path Twilio will use (use `crypto.randomInt`).
3. Add `env.OTP_PROVIDER` to `config/env.ts` schema (already exists; verify enum).
4. In `mobile/app/(auth)/verify-otp.tsx`, add the "Dev mode — use 123456" banner gated on `__DEV__`.

**Gate:**
- [ ] `OTP_PROVIDER=mock` still works end-to-end (request → verify → token)
- [ ] Setting `OTP_PROVIDER=twilio` returns a startup error from the exhaustiveness check in `getOtpProvider()` (proves the swap path is live)
- [ ] Dev banner visible in dev builds, absent in `expo start --no-dev`

---

## PHASE 0.4 — Session persistence (do this BEFORE Phase 1)

This is how every real mobile app behaves — Instagram, WhatsApp, Gmail, Telegram. Closing the app does **not** log the user out. The access token expires every 15 minutes and the user never sees a login screen because the app silently swaps in a fresh one. The refresh token lives in the device's encrypted Keychain/Keystore and rotates on every use.

Lifted into its own phase because nothing else in the app works without it. If session persistence isn't right, the rest is decoration.

### 0.4.1 Backend: `/auth/refresh` endpoint with reuse detection

**Goal:** a valid refresh token exchanges for a new access+refresh pair; reusing an old token revokes the family.

**Tasks:**
1. Migration M1: `refresh_tokens` table (see `04-DATABASE-SCHEMA.md` §11).
2. `backend/src/modules/auth/token.service.ts` with `issueRefresh`, `rotateRefresh` (pseudocode in `03-BACKEND-ARCHITECTURE.md` §5.2.2).
3. Wire `/auth/verify-otp` to call `issueRefresh(userId)` after successful verify.
4. Wire `/auth/refresh` to call `rotateRefresh(token)` — mark old used, mint new in same family, all in one Postgres transaction.
5. Wire `/auth/logout` to mark the current `jti` revoked.
6. Tests:
   - Refresh twice — both succeed.
   - Refresh once, then call refresh again with the **first** token — second call 401 + entire family revoked.
   - Logout, then refresh — 401.

### 0.4.2 Mobile: secure-store persistence + cold-start bootstrap

**Goal:** closing the app does not log the user out. Cold start lands them back in `/(app)` if the refresh token is still valid.

**Tasks:**
1. Extend `mobile/src/utils/secureStorage.ts` to also persist `user` (JSON), `contactSalt`, and a `biometricRequired` flag.
2. Extend `mobile/src/store/authStore.ts`: `setSession`, `setAccessToken` (separately), `signOut` (clears secure-store too).
3. `mobile/src/api/auth.api.ts`: add `refresh(refreshToken)` calling `POST /auth/refresh`.
4. `mobile/src/features/auth/boot.ts`: `bootstrapAuth()` state machine (full code in `02-FRONTEND-ARCHITECTURE.md` §5.1.3).
5. `mobile/app/index.tsx`: rewrite to render `SplashScreen` / `OfflineScreen` / `Redirect` based on boot result.
6. `mobile/src/api/client.ts`: add the single-flight 401 → refresh → retry interceptor (see §5.1.5 of frontend doc).
7. Tests:
   - Cold start with valid refresh token → reaches `/(app)` (mocked `/auth/refresh` returns 200).
   - Cold start with no refresh token → reaches `/(auth)/login`.
   - Cold start with expired refresh → `/auth/refresh` 401 → clears secure-store → login.
   - Cold start with network error → renders `OfflineScreen`.
   - Two concurrent 401s in flight → only one `/auth/refresh` fires.

### 0.4.3 (Designed, NOT shipped) Biometric + multi-account

The auth state machine is already a state machine, not a boolean. Adding later:

- `expo-local-authentication` (added in Phase 6 alongside Settings).
- Secure-store keys become `auth.refreshToken.<userId>` etc.
- New `auth.activeUserId` pointer.

Architecture supports it from day one; UI lands in v1.1.

**Gate for Phase 0.4:**
- [ ] All backend refresh tests pass
- [ ] All mobile boot tests pass
- [ ] Manual: login on simulator → kill app from app switcher → relaunch → lands on `/(app)` (no OTP prompt)
- [ ] Manual: invalidate the refresh token on the server → relaunch app → lands on login
- [ ] Manual: airplane mode on → relaunch app → `OfflineScreen` with retry button
- [ ] Backend: a refresh-token replay (using the old token after rotation) returns 401 within 1 s of the rotation

---

## PHASE 1 — Auth solid (1 session)

### 1.1 Refresh-token rotation + reuse detection

**Goal:** refresh token rotation works; reused token kills the family.

**Tasks:**
1. Migrate: create `refresh_tokens` table (M1 from §11 of schema doc).
2. `backend/src/modules/auth/token.service.ts`:
   - `issueRefresh(userId, familyId?)` → returns `{ token, jti }`.
   - `rotateRefresh(token)` → checks jti, returns new pair, marks old used; on mismatch → revokes whole family.
3. Update `/auth/verify-otp` and `/auth/refresh` to use the new service.
4. Update `/auth/logout` to revoke current family.
5. Mobile `src/store/authStore.ts`: store refresh token in `expo-secure-store`; add `refresh()` action.
6. Mobile `src/api/client.ts`: implement the 401 → refresh → retry interceptor (already drafted in §6 of frontend doc).
7. Tests:
   - Rotation: refresh twice, both succeed.
   - Reuse: refresh once, then call with the first token → second call 401 + first family revoked.
   - Logout: refresh fails after logout.

**Gate:**
- [ ] Tests pass
- [ ] Manual: login → kill access token (set expiry to 1s in dev) → next API call auto-refreshes
- [ ] Manual: copy a refresh token, use it on a second device, observe the first device's next refresh returns 401

### 1.2 User settings row

**Goal:** lazy-create user_settings on first read; default values applied.

**Tasks:**
1. Migrate: create `user_settings` table.
2. `users.service.getOrCreateSettings(userId)`.
3. Endpoints: `GET /users/me/settings`, `PATCH /users/me/settings`.
4. Mobile: hook in `src/store/settingsStore.ts`.

**Gate:**
- [ ] Settings appear on first profile fetch
- [ ] Toggling `pushEnabled` round-trips

---

## PHASE 2 — Home (groups-first) (1 session)

The home screen is **the list of groups the user belongs to**, with a recent-activity feed. **No stories.**

### 2.1 DB migration M2 (groups + posts + discussion)

**Goal:** schema for groups, posts, discussion_meta, media.

**Tasks:**
1. Generate migration `add_groups_and_posts` (Prisma will produce the SQL based on the schema in `04-DATABASE-SCHEMA.md` §2.4–2.9).
2. Verify Prisma client compiles (`pnpm prisma generate` then `pnpm tsc`).

**Gate:**
- [ ] `pnpm prisma:migrate` clean
- [ ] Prisma Studio shows groups, posts, discussion_meta, media, post_media, responses, response_media, reactions, comments

### 2.2 Groups API (backend)

**Goal:** endpoints a logged-in user needs to see their groups on Home.

**Endpoints:**
| Method | Path | Returns |
| --- | --- | --- |
| GET | `/groups?mine=true&limit=20&cursor=...` | Groups the user is a member of, sorted by latest activity. Cursor on `(lastActivityAt, id)`. |
| GET | `/groups/:id` | One group + members list. |
| POST | `/groups` | body: `{ name, memberIds[] }` — creates a group; the author is added automatically. |
| GET | `/groups/:id/posts?cursor=...` | Posts in this group, visibility-filtered for the viewer. |

`GET /groups?mine=true` must include a derived `latestPost` field per group (id, caption preview, createdAt) so the home screen can show "last activity" without a second round-trip.

**Visibility model:**
- Group membership is server-enforced. If `viewerId ∉ groupMembers(groupId)`, return 403 on `/groups/:id` and `/groups/:id/posts`.
- Posts within a group are visible to **all members** of that group. The hidden-discussion lockdown is about *responses being hidden until the timer ends*, not about the post itself.

**Gate:**
- [ ] Mobile renders the groups list from this endpoint
- [ ] 403 when a non-member tries to read `/groups/:id`

### 2.3 Home screen — groups list (UI)

**Goal:** screen 3 in our new world — a list of groups, not stories.

**Tasks:**
1. `mobile/app/(app)/_layout.tsx` — bottom tab nav. Tabs: Home / Groups / Create (FAB) / Notifications / Profile.
2. `mobile/app/(app)/home.tsx` — header "Your groups" + FlatList of group rows + recent-activity feed below.
3. `src/components/GroupRow.tsx` — avatar stack of member avatars, group name, last-post preview, "2h ago" timestamp.
4. `src/components/RecentActivityRow.tsx` — small horizontal scroll of the last 5 posts across all groups.
5. `src/components/Fab.tsx` — bottom-right, above the tab bar, opens Create Post flow.
6. `src/api/groups.api.ts` — `listMyGroups(cursor?)`, `getGroup(id)`, `listGroupPosts(groupId, cursor?)`.
7. Add TanStack Query: `pnpm @tanstack/react-query`, wrap app in `<QueryClientProvider>`.

**Gate:**
- [ ] Home shows group rows for the logged-in user
- [ ] Empty state when the user has no groups ("Start a discussion — tap +")
- [ ] FAB present at the right spot (above tab bar, bottom-right)

### 2.4 Group detail screen (3a)

**Goal:** tapping a group on Home opens a screen showing that group's posts.

**Tasks:**
1. `mobile/app/(app)/group/[id].tsx` — group header (name, member avatars, "Add member" affordance v2) + vertical list of the group's posts.
2. `src/components/PostCard.tsx` — reusable post card that shows caption preview, time, status badge ("Active", "Revealed").
3. Tap a post → opens the Hidden Discussion sheet (Phase 4) or Results Reveal (Phase 4).

**Gate:**
- [ ] Tap a group on Home → opens group detail with the right posts
- [ ] Member avatar stack renders correctly (overlapping circles)

---

## PHASE 3 — Create post flow (1–2 sessions)

The create flow combines timer + group + invitees. A post is **always** published to a group; the group is created or reused during the same flow.

Screens 4 → 8 (revised).

### 3.1 Create post UI (one screen at a time)

1. `mobile/app/(app)/create/index.tsx` — screen 4 (Create Post). Caption input + media picker (image / video / audio / pdf).
2. `mobile/app/(app)/create/timer.tsx` — screen 8 (Set Result Timer). 30m / 1h / 3h / custom.
3. `mobile/app/(app)/create/invites.tsx` — screen 6 (Group Invitation). Text input for **group name** (required), multi-pick contacts.
4. `mobile/app/(app)/create/group-exists.tsx` — screen 7 (modal). If a group with these exact members already exists: "Reuse group" / "Cancel".
5. `src/store/composerStore.ts` — multi-step state (caption + media → timer → invites → publish).

### 3.2 Groups + invites backend

1. Endpoints: `POST /groups` (already defined), `POST /groups/:id/invites`, `POST /groups/:id/invites/:inviteId/accept` / `reject`.
2. `findOrCreateGroupByMembers(authorId, memberIds)` — service helper. If a group already exists with exactly these members AND the author is a member, return that group's id. Otherwise create a new one.
3. Service handles "group exists" detection (returns the existing group; the UI surfaces the modal).

### 3.3 Post publish backend

1. `POST /posts` validates: caption length, ≥ 1 accepted invite, valid `timerMinutes`, no more than 4 media items.
2. Atomic transaction: insert post + insert `discussion_meta` + (optionally) link to existing group OR create new group via `findOrCreateGroupByMembers`.
3. The group's `lastActivityAt` is bumped to the post's `createdAt`.
4. Idempotency-Key header support (1 h cache).

**Gate for Phase 3:**
- [ ] End-to-end flow works: Home → FAB → Create → timer → invites → Publish → returns to Home with the new group visible
- [ ] "Group exists" modal surfaces when the chosen contacts already share a group with the author
- [ ] Publishing with 0 accepted invites returns an inline error

---

## PHASE 4 — Hidden discussion + reveal (1 session)

Screens 9, 10, 11.

### 4.1 Hidden discussion sheet (screen 9)

1. `mobile/app/(app)/post/[id]/index.tsx` — renders the discussion sheet when post status is `active`.
2. Component: `src/features/posts/components/DiscussionSheet.tsx`.

### 4.2 Countdown timer (screen 10)

1. `mobile/app/(app)/post/[id]/countdown.tsx`.
2. `src/hooks/useCountdown.ts` — tick every second, recompute `endsAt - now`.

### 4.3 Backend reveal job

1. Add `pg_cron` migration: `SELECT cron.schedule('reveal-discussions', '* * * * *', $$ … $$);`
2. SQL function from §5 of schema doc.

### 4.4 Results reveal (screen 11) — interactive

**Goal:** after the timer ends, the post body + all responses are visible AND the user can react, like, and comment.

**Three distinct actions, each with its own endpoint:**

| Action | Endpoint | Model touched | UI |
| --- | --- | --- | --- |
| **Like** (idempotent toggle) | `POST /posts/:id/like` / `DELETE /posts/:id/like` | `reactions` table | Heart icon with count |
| **React** (typed: 'like / love / insightful') | `POST /posts/:id/react` / `DELETE /posts/:id/react` | `reactions` table | Emoji picker; same endpoint as like, just different `type` |
| **Comment** (text thread) | `GET /posts/:id/comments` / `POST /posts/:id/comments` | `comments` table | Comment composer at the bottom of the reveal screen |

**Implementation note:** "like" and "react" both write to the same `reactions` table. The schema already models this (`type String` field, defaulting to `'like'`). For v1, the like button and the react picker both call the same endpoint with different `type` values — same row, different labels. This keeps the data model DRY.

**Tasks:**
1. `mobile/app/(app)/post/[id]/results.tsx` — renders the post body, all responses, **and** the interactive bottom bar: heart (like), emoji (react picker), comment composer.
2. `src/components/LikeButton.tsx`, `src/components/ReactPicker.tsx`, `src/components/CommentComposer.tsx`, `src/components/CommentThread.tsx`.
3. `src/api/posts.api.ts` — add `like`, `unlike`, `react`, `unreact`, `addComment`, `listComments`.
4. Backend endpoints per the table above. Visibility check: must only work on posts with `status = 'revealed'`. Service returns 403 on `active` posts.
5. Notifications: a comment on a post → notify the post author and other commenters in the thread.

**Gate:**
- [ ] Create post with 5-minute timer (dev override)
- [ ] Second user in group sees the post and can submit a response
- [ ] Third user NOT in the group sees the post card on Home but gets 403 if they open it
- [ ] After 5 minutes, cron fires, status flips, third user can now read responses
- [ ] Third user can like the revealed post → heart fills, count goes 0 → 1
- [ ] Third user can react (e.g. "insightful") → emoji shows next to count
- [ ] Third user can comment → comment appears in the thread
- [ ] Post author gets a notification for the new comment

---

## PHASE 5 — Media + reports (1 session)

Screens 12, 13.

### 5.1 Media upload

1. `POST /media/upload` (multipart, 25 MB cap).
2. `GET /media/static/:id` (auth required).
3. `expo-image-picker` on mobile; `expo-av` for video; `expo-audio` for audio.
4. Validate mime type server-side; reject anything not in the allow-list.

### 5.2 Report submission

1. `POST /reports` (rate-limited).
2. Mobile: long-press on a post → report sheet (screen 13).

**Gate:**
- [ ] Upload image → attaches to a post → preview shows in Create Post (screen 4)
- [ ] Report submitted → appears in `reports` table

---

## PHASE 6 — Notifications + profile + settings (1 session)

Screens 14, 15, 17.

### 6.1 Notifications

1. `GET /notifications` with `?tab=all|invites|updates|reports`.
2. Notification triggers (in services): on invite sent, on results available, on comment, on report resolved.
3. Mobile: `src/features/notifications/` + `notifications.tsx` screen.

### 6.2 Profile

1. `GET /users/:id` with stats (post count, active group count, connection count).
2. `mobile/app/(app)/profile/[userId].tsx` — screen 15.

### 6.3 Settings

1. `PATCH /users/me/settings`.
2. `mobile/app/(app)/settings.tsx` — screen 17.

**Gate:**
- [ ] Inviting another user creates a notification for them
- [ ] When the timer ends, all group members get a "Results available" notification
- [ ] Settings toggles persist across app restarts

---

## PHASE 7 — Admin web (separate repo or sibling folder)

Screen 16 lives in a separate React + Vite app that consumes the same backend. **Out of mobile scope.** Separate docs when we get here.

---

## PHASE 8 — Production hardening

### 8.1 Twilio swap

1. Add `@twilio/sdk` to backend.
2. Implement `TwilioOtpProvider`.
3. For India: DLT-registered templates; entity IDs + template IDs in env.
4. Switch `OTP_PROVIDER=twilio` in staging. Smoke test on a real device with a real Indian number.
5. Remove the "Dev mode — use 123456" banner gate.

### 8.2 Performance pass

1. Lighthouse audit on the mobile web build (expo web).
2. Add `expo-image` for media rendering.
3. Bundle analyzer: confirm `libphonenumber-js/min` is the only metadata variant on mobile.

### 8.3 Security pass

1. Pen-test the auth + reveal flows.
2. Verify OTP never appears in any log file.
3. Verify all `req.body` paths go through zod.

### 8.4 Observability

1. Pino → log aggregation (whatever the team picks).
2. Error tracking (Sentry or equivalent).
3. Metrics: counts of posts, reveals, reports (Prometheus or similar).

---

## PHASE 9 — v2 features (parking lot)

Re-evaluate each at the next planning session:

- Dark mode
- Push notifications (FCM / APNs)
- Email sign-in
- Edit profile
- Two-factor auth
- Account deletion
- Hashtags / search
- Pre-signed S3 URLs (currently multipart; upgrade when needed)
- Biometric lock on cold start (architecture supports it; UI not built)
- Multi-account support (architecture supports it; UI not built)

---

## Definition-of-done for the whole MVP

The MVP is shipped when **all** of the following are true:

- [ ] All 17 screens from the references are implemented to spec
- [ ] Backend has no `TODO` / `FIXME` / `console.log` outside of tests
- [ ] All env vars validated at boot
- [ ] All `AppError` paths return the correct envelope
- [ ] OTP, verify, refresh, logout all have passing tests
- [ ] Phone validation rejects landlines and wrong-country numbers
- [ ] Refresh-token reuse detection works in tests
- [ ] Hidden discussion + reveal flow works end-to-end with the cron job
- [ ] Mobile Lighthouse ≥ 90 on Performance and Accessibility (web build)
- [ ] iOS + Android builds open in Expo Go without red screens
- [ ] No mock banner visible in production builds

---

## Decisions to confirm with the user before each phase

These are flagged in `02-FRONTEND-ARCHITECTURE.md` §13. **All kickoff decisions are now resolved.** Remaining open questions are tactical (deferred to the relevant phase), not strategic.

| Phase | Decision | Status |
| --- | --- | --- |
| P2 | Story creation in MVP or v2? | **Resolved — in v1 (full create + view)** |
| P2 | Auto-skip splash on warm start, or always show? | **Resolved — always show** |
| P3 | Group naming required, or auto-derived from invitees? | **Resolved — user types it** |
| P4 | Comments + reactions allowed on revealed posts in MVP, or v2? | **Resolved — in v1 (three actions: comment, react, like)** |
| P5 | Multipart upload (faster to ship) or pre-signed S3 URLs from day one? | Open — default multipart for MVP |
| P6 | Settings: change-password + 2FA in MVP, or v2? | Open — default v2 |
| P8 | Real OTP provider — which one? | Open — user will tell us |

### Resolved decisions (locked)

| Question | Answer |
| --- | --- |
| Story creation in v1? | **Yes — full create + view in v1.** New screens 3a (Create Story) and 3b (Story Viewer) added to the inventory. |
| Splash every launch? | **Yes.** NEXORA logo + tagline shows on every cold start. |
| Group name? | **User types it.** Screen 6 has a text input. |
| Comments / reactions / likes on reveal? | **Yes — in v1.** Three distinct actions stored + rendered. |
| Roles? | **Two only — User, Admin.** Admin reserved in DB, unused in v1. |
| Mobile only or also web? | **Mobile only** — iOS + Android. No web client in MVP. |
| Hosting? | **AWS.** Pricing out of scope. Managed Postgres + managed Redis + S3. |
| Media storage? | **S3.** Multipart upload for MVP, pre-signed URLs as v1.1. |
| Email tab on Login? | **No.** Ship Login with Mobile/OTP only. |
| Brand name flexibility? | **Centralised config.** `mobile/src/config/app.ts` and `backend/src/config/brand.ts`. |
| Test depth? | **Test-lite.** Auth, phone validation, visibility checks get unit tests; manual smoke for everything else. |
| Reference screen changes? | **None.** The 17 reference images + `06-hidden-discussion-detail.png` are the target. |

---

## Trigger conditions for "scale" additions (per CLAUDE.md)

If you ever find yourself wanting to add any of these, **stop and check the trigger**:

| Want | Real trigger |
| --- | --- |
| Message queue (BullMQ) | A background job takes > 5 s or fails under retry load |
| Microservice split | A module's deployment cadence diverges from the rest |
| Separate worker process | A cron-like job blocks the request loop |
| Generic cache layer | A read path shows in profiling with p95 > 200 ms and is genuinely repeated |
| Pre-signed S3 URLs | Mobile uploads fail due to size or transit time on > 5 % of attempts |
| Push notification provider | In-app notifications prove insufficient; we have the data to show this |
| GraphQL gateway | Mobile needs multiple resource types in a single round-trip and the schema fragments are stable |

Each is a one-day PR if and when needed. Until then: don't build it.