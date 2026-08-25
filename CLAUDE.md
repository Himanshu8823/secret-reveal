# Technical Rules

> Save this file as `CLAUDE.md` in the repo root. It should be read at the start of every coding session, before any feature prompt.

## Guiding principle

**Build for scale, don't build the scale yet.** Structure the code so it *can* grow — clean module boundaries, no logic trapped in route handlers, no direct SQL scattered across files — but do not add infrastructure (queues, microservices, caching layers, generic plugin systems) until an actual, current requirement needs it. If you're about to add an abstraction "in case we need it later," stop and ask first. YAGNI beats speculative flexibility at this stage.

---

## Language & tooling

- TypeScript everywhere, `strict: true` in both `mobile/tsconfig.json` and `backend/tsconfig.json`. No `any` without a comment explaining why it's unavoidable.
- ESLint + Prettier in both apps, run on pre-commit (husky + lint-staged is fine — that's a small enough addition to not count as over-engineering).
- No new dependency added without a one-line reason. Prefer a well-known, actively maintained package over a niche one, even if the niche one is "more elegant."

## Folder & module conventions

- Backend: organize by **feature module** (`modules/auth`, `modules/posts`, etc.), not by technical layer (`/controllers`, `/services` as top-level folders). Each module owns its routes, controller, service, validation, and types together.
- Mobile: same idea under `src/features/*`. Shared UI primitives go in `src/components`, shared logic in `src/utils` or `src/hooks` — only promote something to "shared" once it's actually used in two places, not preemptively.
- Never import backend code into the mobile app or vice versa. If types need to be shared later, that's the point where a shared package becomes justified — not before.

## API conventions

- All routes prefixed `/api/v1/...` — version from day one, costs nothing now, saves a painful migration later.
- Every response follows one envelope shape:
```json
{ "success": true, "data": { } }
{ "success": false, "error": { "code": "OTP_EXPIRED", "message": "..." } }
```
- Every request body validated with `zod` at the controller boundary, before it touches any service logic. Never trust `req.body` unvalidated.
- Errors flow through one centralized error-handling middleware. Services and controllers throw a typed `AppError`, not raw strings or generic `Error`.

## Database rules

- Prisma is the only way the backend touches Postgres. No raw string-concatenated SQL, ever — if raw SQL is genuinely needed for a specific query, use Prisma's parameterized `$queryRaw` with tagged templates, never string interpolation.
- Schema changes only via `prisma migrate dev` — the migration history is the source of truth, nobody hand-edits the database directly, including in development.
- Table/column names: snake_case at the DB level is fine (Prisma maps it), camelCase in application code.
- Every model gets `createdAt` / `updatedAt`. Don't add `deletedAt` (soft-delete) until we actually decide we need soft deletes somewhere — don't default to it everywhere.

## Caching & rate limiting

- Redis is for two jobs right now: OTP storage with TTL, and rate-limit counters. Don't reach for it as a general-purpose cache until there's an actual slow, repeated read to optimize.
- Every Redis key gets an explicit TTL. No key lives forever by accident.
- Never cache anything containing another user's private data under a key any other user could guess or access.
- Rate limiting lives in Redis (via `rate-limiter-flexible`), not in-memory — in-memory limits reset on every server restart and won't work the moment there's more than one server instance.

## Security baseline

- Secrets only via environment variables, validated at process boot with a zod schema — the app should refuse to start if a required env var is missing, not fail confusingly later.
- Never log OTPs, tokens, or full phone numbers in production-level logs. Mask them (`+91XXXXXX1234`) if logging is needed for debugging.
- `helmet` on the Express app, CORS locked to known origins (not `*`) once the mobile app's calling pattern is known.
- JWT secret is a real random value in `.env`, never committed. Access tokens short-lived; refresh tokens longer-lived and stored in `expo-secure-store` on device, never in plain `AsyncStorage`.
- Every public endpoint that accepts user input gets rate-limited. No exceptions "just for now."

## Scalability without over-engineering

- One Node service, one Postgres database, one Redis instance is the correct architecture for this phase. Do not introduce message queues, background job frameworks, or service splitting until there's a concrete operational reason (e.g., an actual slow background task blocking requests).
- Keep business logic inside the `service` layer of each module, not in controllers. This is what makes it possible to extract something into its own service later without a rewrite — it's the one piece of "future-proofing" worth doing now because it costs nothing today.
- Don't build generic/configurable systems for things we only have one instance of. Example: don't build a pluggable "notification channel" abstraction until we actually have more than one notification channel to plug in.

## Git & workflow

- Conventional commits (`feat:`, `fix:`, `chore:`, `refactor:`) — makes changelog generation and history scanning trivial later.
- Small, focused commits/PRs over large ones. If a change touches both mobile and backend, that's usually a sign it should be two commits.

## Testing

- Not chasing high coverage at this stage, but auth logic (OTP verification, JWT issuance, new-vs-existing-user branching) gets unit tests — this is the one module where a silent regression is genuinely costly (locks users out or lets the wrong person in).
- Don't set up a full e2e testing pipeline yet — revisit once there's more than the auth flow to test.

## When in doubt

If a rule in this file conflicts with a specific instruction in a feature prompt, the feature prompt wins for that session — but flag the conflict out loud instead of silently picking one.
