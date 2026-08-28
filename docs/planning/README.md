# NEXORA — Planning Documents Index

> Single entry point for the planning docs the user asked for. Read top-down.

---

## What we built and why

This is the planning layer for **NEXORA**, a privacy-first social app for small-group, time-boxed discussions. The product idea: post a question, invite a group, set a timer, and responses are hidden until the timer ends. The references are 17 screen designs stored under `docs/images/`.

The user asked for:
1. Tailwind installed and set up with version compatibility.
2. Mobile number validation (international, with a real package).
3. OTP working with a clear path to Twilio.
4. Design tokens extracted from references (colors, radius, typography).
5. A complete, multi-screen UI plan based on the references.
6. Detailed docs for the whole stack — not just code.
7. Postgres schema designed for scale (real indexes, FKs, cascades).
8. Bottlenecks, edge cases, rate limiting, security, validation.

---

## Documents

| File | Purpose |
| --- | --- |
| `00-DESIGN-TOKENS-EXTRACTION.md` | All colors, spacing, four border radii (8 / 12 / 16 / full), typography, mapped to NativeWind |
| `01-MASTER-PRD.md` | Personas, journeys, screen inventory (17 screens), in/out of MVP scope, success metrics, risks |
| `02-FRONTEND-ARCHITECTURE.md` | Mobile folder layout, NativeWind setup steps, component primitives, state management, OTP provider abstraction, API client |
| `03-BACKEND-ARCHITECTURE.md` | Backend folder layout, response envelope, error model, full API surface, rate limiting, security baseline, logging redaction, edge cases |
| `04-DATABASE-SCHEMA.md` | Every table with Prisma, FK cascade rules, indexes, query optimisations, the `pg_cron` reveal job, edge cases, migration sequence |
| `05-IMPLEMENTATION-ROADMAP.md` | Ordered phases (0–9), gate per phase, definition-of-done for the whole MVP, trigger conditions for scale additions |

---

## Reference images

All stored in `D:/secret-reveal/docs/images/`:

| File | What it shows |
| --- | --- |
| `01-all-screens-overview.png` | All 17 screens at a glance — canonical reference |
| `02-home-feed-detail.png` | Home Feed detail — stories, post cards, FAB placement |
| `03-create-post-screen.png` | Create Post screen — option grid |
| `04-create-post-duplicate.png` | Same screen, duplicate copy |
| `05-create-post-clean.png` | Same screen, clean copy — primary reference for screen 4 |

`01-all-screens-overview.png` is the canonical reference for screens 1–17. Use it for spacing, layout, and color judgement. The other files are zoomed or cropped views used by the implementation roadmap.

---

## Headline decisions (TL;DR)

1. **Tailwind via NativeWind v4.2.6 + Tailwind v3.4.17.** Don't fight `StyleSheet`. Set up NativeWind once, then every new screen uses `className`. The four-radii rule (`sm=8, md=12, lg=16, full`) is enforced everywhere. Babel plugin is `react-native-worklets/plugin` (Reanimated 4) and must be last.
2. **Phone validation via `libphonenumber-js`.** Backend uses `metadata.max`, mobile uses `metadata.min` (smaller Hermes bundle). Same library on both sides, no duplication of country rules.
3. **OTP via a `OtpProvider` interface.** Mock today. Real provider decision deferred — when decided, the swap is one file because `getOtpProvider()` is exhaustive-typed.
4. **One Node service, one Postgres, one Redis on AWS.** No queues, no workers, no microservices. The reveal job runs as a `pg_cron` SQL function in Postgres itself. Pricing is out of scope per user.
5. **Mobile only — iOS + Android via Expo SDK 54.** No web client in MVP.
6. **S3 for media storage.** Direct multipart for MVP (cap 25 MB); pre-signed URLs as v1.1.
7. **Groups-first product.** Home = list of groups the user belongs to (sorted by latest activity). A post **always** belongs to a group — there is no public posting in MVP. The hidden-discussion lockdown is about *responses being hidden until the timer ends*, not about who can see the post.
8. **No stories.** NEXORA is not Instagram. The reference images showed story rings; we explicitly chose not to ship stories. This is the core product differentiator — keep the home calm.
9. **Server-side visibility checks are non-negotiable.** Even if a malicious client requests hidden-discussion responses, the backend returns 403 until the timer ends. The DB has no concept of "hidden" — access control is in the service layer.
10. **Privacy-safe contact sync.** Server never receives raw phone numbers. Mobile hashes each contact with a per-user salt; server intersects against a `phone_hash` column.
11. **Session persistence is mandatory, not optional.** Closing the app does not log the user out — cold start reads the refresh token from `expo-secure-store`, calls `/auth/refresh`, and lands on `/(app)` if valid.
12. **Designed for biometric lock + multi-account from day one.** Auth state is a state machine, secure-store keys are namespaced by userId, the unlock screen component exists from v1.
13. **No Email tab on Login.** Screen 2 ships with only the Mobile/OTP flow. Email sign-in is v2.
14. **Brand name is centralised in one config file.** Currently `NEXORA`; lives in `mobile/src/config/app.ts` and `backend/src/config/brand.ts`.
15. **No redesigns of the reference screens.** The 17 reference images are the target (minus the stories, which we explicitly exclude).

---

---

## What's still pending (handoffs)

The following are **tactical** open questions, not strategic ones. All strategic product decisions from the kickoff are locked.

1. **OTP provider choice** (Twilio Verify vs Twilio Programmable SMS vs MSG91 vs others). Not chosen yet — user will tell us later. Provider abstraction is already in place (`OtpProvider` interface, exhaustive-typed factory), so the swap is one file when decided.
2. **S3 upload strategy for MVP.** Two options — direct multipart (simpler now, ~25 MB cap) or pre-signed URLs (production-grade, no size bottleneck). Default for MVP: multipart. Switch to pre-signed in v1.1. Flag this for explicit confirmation before Phase 5.
3. **AWS-specific deployment topology.** ECS vs Fargate vs EC2. RDS vs Aurora. ElastiCache vs MemoryDB. **All out of scope for the planning docs** — the docs assume "Postgres 16 + Redis 7 managed instances," which both deliver. When the user is ready to deploy, this becomes a separate ops doc.
4. **Biometric-required default for new users.** Architecture supports it; we'll set the default (`false` in v1, `true` optional in v1.1) when we get to Settings.

### Deferred tactical decisions (will be raised at the relevant phase, not now)

| Phase | Question | Default to apply if no answer |
| --- | --- | --- |
| P5 | Multipart vs pre-signed S3 upload | Multipart for MVP |
| P6 | Change-password + 2FA in MVP or v2? | v2 |
| P8 | Real OTP provider choice | User will tell us |

## Resolved research decisions

| Topic | Decision | Where |
| --- | --- | --- |
| Phone validation | `libphonenumber-js` (`max` on backend, `min` on mobile) | `02-FRONTEND-ARCHITECTURE.md` §7 |
| Tailwind for RN | **NativeWind v4.2.6** + Tailwind v3.4.17 (v5 is preview, rejected) | `02-FRONTEND-ARCHITECTURE.md` §2 |
| Babel plugin for Reanimated 4 | `react-native-worklets/plugin` (NOT `react-native-reanimated/plugin`) — must be last | `02-FRONTEND-ARCHITECTURE.md` §2.3 |
| Dark-mode strategy | `darkMode: 'class'` (programmatic toggle, not OS-locked) | `02-FRONTEND-ARCHITECTURE.md` §2.5 |

## Resolved product decisions

| Topic | Decision |
| --- | --- |
| Story creation in v1? | **No — out of scope.** Home is groups-first. Posts are private to groups. |
| Splash screen on warm start? | **Always show.** Every cold launch. |
| Group name? | **User types it.** No auto-generated names. |
| Comments / reactions / likes on reveal? | **Yes — all three in v1.** Same `reactions` table, distinct endpoints. |
| Roles? | **Two only — User, Admin.** Admin reserved in DB, unused in v1. |
| Login screen | **Mobile/OTP only.** No Email tab. |
| Platform | **Mobile only** (iOS + Android). |
| Hosting | **AWS** — Postgres + Redis managed, S3 for media. Pricing out of scope. |
| OTP provider | TBD — `OtpProvider` interface ready, swap is one file. |
| Brand name | **Centralised config.** `mobile/src/config/app.ts` + `backend/src/config/brand.ts`. |
| Test depth | **Test-lite.** Auth, phone, visibility checks unit-tested. Manual smoke for the rest. |
| Reference screens | **Use as-is** (minus stories). 17 reference images + `06-hidden-discussion-detail.png` for screen 9. |
| **Home is groups-first** | List of groups the user belongs to + recent activity. No stories, no public feed. |
| **Posts are private to groups** | Every post belongs to a group. The hidden-discussion lockdown is about *responses*, not post visibility. |

---

## How to use these docs

- **Starting work?** Open `05-IMPLEMENTATION-ROADMAP.md`, find the current phase, run the gate before moving on.
- **Designing a screen?** Open `00-DESIGN-TOKENS-EXTRACTION.md` first. Then `02-FRONTEND-ARCHITECTURE.md` for the component primitives. Then the reference image named in the roadmap.
- **Building a backend module?** Open `03-BACKEND-ARCHITECTURE.md` for the route + validation contract, `04-DATABASE-SCHEMA.md` for the data shape.
- **Unsure about scope?** Open `01-MASTER-PRD.md` §5 (in/out of MVP) and §7 (risks).