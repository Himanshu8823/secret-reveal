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
3. **OTP via a `OtpProvider` interface.** Mock today, Twilio is a one-file swap because `getOtpProvider()` is exhaustive-typed. Dev banner shows on the verify-otp screen in dev builds.
4. **One Node service, one Postgres, one Redis.** No queues, no workers, no microservices. The reveal job runs as a `pg_cron` SQL function in Postgres itself.
5. **Server-side visibility checks are non-negotiable.** Even if a malicious client requests hidden-discussion responses, the backend returns 403 until the timer ends. The DB has no concept of "hidden" — access control is in the service layer.
6. **Privacy-safe contact sync.** Server never receives raw phone numbers. Mobile hashes each contact with a per-user salt; server intersects against a `phone_hash` column.
7. **Refresh-token rotation with reuse detection.** Every refresh creates a new `jti`; reusing an old one revokes the whole family. Defends against token theft.

---

## What's still pending (handoffs)

The following were investigated but the final decision needs to be locked down at implementation time:

1. **Twilio Verify vs Twilio SMS (programmable messaging).** Both work; Verify is simpler for compliance (Twilio owns OTP generation), SMS gives us control. Decide at Phase 8.
2. **Story creation in MVP.** References show a "Your Story" ring with a `+`; whether users can *create* stories in MVP or only *view* them is open. Default: viewing only, with creation as v2.
3. **Email sign-in tab.** Reference shows "Mobile | Email" tabs on Login. Email sign-in is v2 by default; the tab can be visible-but-disabled for now.
4. **Server-side contact salt distribution.** The PRD and schema doc use a per-user salt. Final mechanism: send `contactSalt` on auth response, store on client in `expo-secure-store`.

## Resolved research decisions

| Topic | Decision | Where |
| --- | --- | --- |
| Phone validation | `libphonenumber-js` (`max` on backend, `min` on mobile) | `02-FRONTEND-ARCHITECTURE.md` §7 |
| Tailwind for RN | **NativeWind v4.2.6** + Tailwind v3.4.17 (v5 is preview, rejected) | `02-FRONTEND-ARCHITECTURE.md` §2 |
| Babel plugin for Reanimated 4 | `react-native-worklets/plugin` (NOT `react-native-reanimated/plugin`) — must be last | `02-FRONTEND-ARCHITECTURE.md` §2.3 |
| Dark-mode strategy | `darkMode: 'class'` (programmatic toggle, not OS-locked) | `02-FRONTEND-ARCHITECTURE.md` §2.5 |

---

## How to use these docs

- **Starting work?** Open `05-IMPLEMENTATION-ROADMAP.md`, find the current phase, run the gate before moving on.
- **Designing a screen?** Open `00-DESIGN-TOKENS-EXTRACTION.md` first. Then `02-FRONTEND-ARCHITECTURE.md` for the component primitives. Then the reference image named in the roadmap.
- **Building a backend module?** Open `03-BACKEND-ARCHITECTURE.md` for the route + validation contract, `04-DATABASE-SCHEMA.md` for the data shape.
- **Unsure about scope?** Open `01-MASTER-PRD.md` §5 (in/out of MVP) and §7 (risks).