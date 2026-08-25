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

## PHASE 2 — Home feed (1 session)

### 2.1 DB migrations M2 + M3 (groups + posts + discussion)

**Goal:** schema for groups, posts, discussion_meta, media.

**Tasks:**
1. Generate migrations via `prisma migrate dev --name add_groups_and_posts` etc.
2. Verify Prisma client compiles.

**Gate:**
- [ ] `pnpm prisma:migrate` clean
- [ ] Prisma Studio shows all tables

### 2.2 Home feed screen (UI)

**Goal:** screen 3 from references renders with skeleton + mocked data.

**Tasks:**
1. `mobile/app/(app)/_layout.tsx` — bottom tab nav, 5 tabs.
2. `mobile/app/(app)/home.tsx` — stories row, feed list, FAB.
3. `src/components/StoryRing.tsx`, `src/components/PostCard.tsx`, `src/components/Fab.tsx`.
4. `src/api/posts.api.ts` — `getFeed(cursor?)` against a stub endpoint that returns fixtures.
5. Add TanStack Query: `pnpm @tanstack/react-query`, wrap app in `<QueryClientProvider>`.

**Gate:**
- [ ] Tab nav visible; Home tab shows stories + 2 post cards
- [ ] FAB present at the right spot (above tab bar, bottom-right)
- [ ] Skeleton appears before fixtures load

### 2.3 Feed API (backend)

**Goal:** `GET /api/v1/posts/feed` returns paginated, visibility-aware posts.

**Tasks:**
1. `posts.service.listFeed(viewerId, cursor, limit)` — returns posts visible to viewer (own posts + posts in groups they're a member of + revealed posts from anyone in their network).
2. Cursor pagination on `(createdAt, id)`.
3. Tests: viewer sees own posts; viewer sees group posts; viewer does NOT see hidden posts in groups they don't belong to.

**Gate:**
- [ ] Mobile renders real data from the API
- [ ] Visibility check holds in tests

---

## PHASE 3 — Create post flow (1–2 sessions)

Screens 4 → 8.

### 3.1 Create post UI (one screen at a time)

1. `mobile/app/(app)/create/index.tsx` — screen 4 (Create Post).
2. `mobile/app/(app)/create/contacts.tsx` — screen 5.
3. `mobile/app/(app)/create/invites.tsx` — screen 6.
4. `mobile/app/(app)/create/group-exists.tsx` — screen 7 (modal).
5. `mobile/app/(app)/create/timer.tsx` — screen 8.
6. `src/store/composerStore.ts` — multi-step state.

### 3.2 Groups + invites backend

1. Endpoints: `POST /groups`, `POST /groups/:id/invites`, `POST /groups/:id/invites/:inviteId/accept` / `reject`.
2. Service handles "group already exists" detection (return the existing one, surface modal UI).

### 3.3 Post publish backend

1. `POST /posts` validates: caption length, ≥ 1 accepted invite, valid `timerMinutes`, no more than 4 media items.
2. Atomic transaction: insert post + insert `discussion_meta` + update group state.
3. Idempotency-Key header support (1 h cache).

**Gate for Phase 3:**
- [ ] End-to-end flow works: Home → FAB → Create → contacts → invites → timer → Publish → returns to Home with new card
- [ ] "Group exists" modal surfaces when the chosen contacts already share a group with the current user
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

### 4.4 Results reveal (screen 11)

1. `mobile/app/(app)/post/[id]/results.tsx` — renders all responses, reactions, comments.
2. Comment composer.

**Gate:**
- [ ] Create post with 5-minute timer (dev override)
- [ ] Second user in group sees the post and can submit a response
- [ ] Third user NOT in the group sees the post card on Home but gets 403 if they open it
- [ ] After 5 minutes, cron fires, status flips, third user can now read responses

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
- Story creation
- Email sign-in
- Edit profile
- Two-factor auth
- Account deletion
- Hashtags / search
- S3 / cloud storage for media

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

These are flagged in `02-FRONTEND-ARCHITECTURE.md` §13 — re-ask at phase kickoff:

| Phase | Decision |
| --- | --- |
| P1 | Email sign-in tab on Login screen (screen 2): visible-but-disabled, or hidden? |
| P2 | Story creation in MVP or v2? |
| P2 | Auto-skip splash on warm start, or always show? |
| P3 | Group naming required, or auto-derived from invitees? |
| P4 | Comments + reactions allowed on revealed posts in MVP, or v2? |
| P6 | Settings: change-password + 2FA in MVP, or v2? |
| P8 | Twilio Verify (managed OTP) or self-managed OTP via Twilio SMS — both work; Verify is simpler for compliance, SMS is cheaper at scale |

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