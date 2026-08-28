# NEXORA — Backend Architecture

> **Stack:** Node 20+, TypeScript strict, Express 4, Prisma 6 + Postgres 16, Redis 7 (ioredis + rate-limiter-flexible), Zod at the boundary, Pino for logs, JWT for auth.
> **Folder:** `D:/secret-reveal/backend/`.
> **Companion docs:** `01-MASTER-PRD.md` (features), `04-DATABASE-SCHEMA.md` (models), `05-IMPLEMENTATION-ROADMAP.md` (sequence).

---

## 1. Guiding principles (recap of CLAUDE.md, applied)

- **One Node service, one Postgres database, one Redis instance on AWS.** Do not introduce queues, microservices, or background workers until a concrete operational reason exists.
- **Media lives in S3.** Direct multipart upload for MVP (cap 25 MB); pre-signed URLs as a v1.1 upgrade.
- **Business logic lives in the service layer of each module.** Controllers stay thin; routes mount + validate + delegate.
- **Validation at the boundary, never trust `req.body`.** Zod schemas in each `*.validation.ts`, called in the controller as the very first line.
- **One error envelope.** Typed `AppError` → central error middleware.
- **All routes prefixed `/api/v1/...`.** Versioned from day one.
- **Prisma is the only way to touch Postgres.** No raw SQL except `$queryRaw` with tagged templates for genuinely complex queries.
- **Pricing is out of scope per user.** Architecture decisions are made for correctness and operability, not cost.

---

## 2. Folder layout (target state)

```
backend/src/
├── server.ts                     # process boot + graceful shutdown
├── app.ts                        # express app composition (testable)
├── config/
│   ├── env.ts                    # zod-validated env at boot
│   ├── db.ts                     # prisma client singleton
│   └── redis.ts                  # ioredis singleton
├── lib/
│   ├── AppError.ts               # typed error class + ErrorCode enum
│   ├── jwt.ts                    # access + refresh token helpers
│   ├── logger.ts                 # pino instance (no OTP/phone in prod)
│   ├── phone.ts                  # maskPhone (exists)
│   ├── otp/                      # provider abstraction
│   │   ├── provider.ts           # OtpProvider interface + factory
│   │   ├── mock.provider.ts      # fixed 123456 (exists as auth/otp.provider.ts)
│   │   └── twilio.provider.ts    # future, NOT in MVP
│   └── rate-limit/
│       ├── otpRequest.limiter.ts
│       ├── otpVerify.limiter.ts
│       ├── auth.limiter.ts       # global auth window
│       └── write.limiter.ts      # per-user write throttle
├── middlewares/
│   ├── errorHandler.ts           # central AppError → envelope
│   ├── requestLogger.ts
│   ├── auth.ts                   # requireAuth(req,res,next)
│   └── rateLimiter.ts            # existing
├── modules/
│   ├── auth/                     # exists
│   │   ├── auth.controller.ts
│   │   ├── auth.routes.ts
│   │   ├── auth.service.ts
│   │   ├── auth.types.ts
│   │   ├── auth.validation.ts
│   │   ├── auth.service.test.ts  # exists
│   │   ├── phone.schema.ts       # libphonenumber-js zod schema
│   │   └── token.service.ts      # refresh token rotation + reuse detection
│   ├── users/                    # profile, lookup, search
│   │   ├── users.controller.ts
│   │   ├── users.routes.ts
│   │   ├── users.service.ts
│   │   ├── users.validation.ts
│   │   └── users.types.ts
│   ├── contacts/                 # device-contact sync + privacy-safe hashing
│   ├── posts/                    # create + read posts
│   ├── groups/                   # groups, invites, accept/reject
│   ├── discussions/              # hidden-discussion timer + reveal logic
│   ├── reactions/                # likes on posts/comments
│   ├── comments/                 # comments on revealed posts
│   ├── notifications/            # in-app notifications
│   ├── media/                    # upload pre-signed URLs (multipart for MVP)
│   ├── reports/                  # user-facing report submission
│   └── admin/                    # report queue + actions (web-only consumers)
├── prisma/
│   ├── schema.prisma
│   └── migrations/
└── tests/                  # integration tests (vitest + supertest)
```

**Module rule**: a module owns its routes, controller, service, validation, types, and (optional) tests. No cross-module imports into another module's internals — only shared imports go through `lib/`.

---

## 3. Response envelope

Every endpoint returns one of:

```json
// success
{ "success": true, "data": { ... } }

// error
{ "success": false, "error": { "code": "OTP_EXPIRED", "message": "OTP expired, request again" } }
```

`error.code` is the machine-readable identifier from the `ErrorCode` enum. `error.message` is human-safe; never contains stack traces.

---

## 4. Error model

`lib/AppError.ts`:

```ts
export enum ErrorCode {
  // Auth
  OTP_EXPIRED = 'OTP_EXPIRED',
  OTP_INCORRECT = 'OTP_INCORRECT',
  OTP_RATE_LIMITED = 'OTP_RATE_LIMITED',
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  // Validation
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  // Resources
  NOT_FOUND = 'NOT_FOUND',
  FORBIDDEN = 'FORBIDDEN',
  CONFLICT = 'CONFLICT',
  // Rate limit
  RATE_LIMITED = 'RATE_LIMITED',
  // Generic
  INTERNAL = 'INTERNAL',
}

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly meta?: Record<string, unknown>,
  ) { super(message); }
}
```

Central middleware (`errorHandler.ts`) catches:
1. `ZodError` → 400 `VALIDATION_FAILED` with `issues[]` in `error.meta`.
2. `AppError` → propagate status + code.
3. Anything else → 500 `INTERNAL`, log full stack server-side, return generic message.

---

## 5. Authentication

### 5.1 Token model

- **Access token**: JWT, HS256, 15 min expiry, payload `{ sub: userId, phone, iat, exp }`.
- **Refresh token**: JWT, HS256, 30 days, payload `{ sub: userId, jti, iat, exp }`. Server stores `jti` in a `refresh_tokens` table; can be revoked.
- **Refresh token storage on client**: `expo-secure-store` only. Never `AsyncStorage`.

### 5.2 Refresh rotation

On every `/auth/refresh`:

1. Validate refresh JWT signature + expiry.
2. Look up `jti` in `refresh_tokens`. If not found → reject and **invalidate entire refresh-token family** (reuse detection).
3. If valid → mark old `jti` used, issue new pair, store new `jti`.
4. If two distinct refresh tokens from the same family are ever both alive → assume token theft; revoke all tokens for that user.

This prevents replay attacks and lets us kill a compromised device's session.

### 5.2.1 The `/auth/refresh` endpoint contract

```
POST /api/v1/auth/refresh
Headers: none (refresh token in body)
Body: { refreshToken: string }

200 OK
{
  "success": true,
  "data": {
    "accessToken": "eyJ…",
    "refreshToken": "eyJ…",   // ← NEW token; old one is now dead
    "user": { id, phone, name, avatarUrl, isNewUser: false }
  }
}

401 (refresh dead or reused)
{ "success": false, "error": { "code": "TOKEN_INVALID", "message": "…" } }
```

**Response shape matches `/auth/verify-otp`** so the client can use the same `setSession` action on either response.

### 5.2.2 Reuse-detection algorithm (pseudocode)

```ts
async function refresh(oldToken: string) {
  const payload = jwt.verify(oldToken, env.JWT_SECRET);
  const oldJti = payload.jti;

  return await prisma.$transaction(async (tx) => {
    const row = await tx.refreshToken.findUnique({ where: { jti: oldJti } });

    // Case 1: never seen this jti — straight reject.
    if (!row) throw new AppError(401, TOKEN_INVALID, 'Unknown token');

    // Case 2: this jti was already used. Reuse! Revoke the entire family.
    if (row.isUsed) {
      await tx.refreshToken.updateMany({
        where: { familyId: row.familyId, isRevoked: false },
        data: { isRevoked: true, revokedAt: now(), revokeReason: 'reuse_detected' },
      });
      await tx.adminAction.create({
        data: { adminId: SYSTEM_ADMIN_ID, action: 'auto_revoke_family', targetType: 'user', targetId: row.userId, metadata: { familyId: row.familyId } },
      });
      throw new AppError(401, TOKEN_INVALID, 'Token reuse detected');
    }

    // Case 3: revoked by logout or another flow.
    if (row.isRevoked) throw new AppError(401, TOKEN_INVALID, 'Revoked');

    // Case 4: expired by time.
    if (row.expiresAt < now()) throw new AppError(401, TOKEN_EXPIRED, 'Expired');

    // Happy path: mark used, mint a new pair in the same family.
    await tx.refreshToken.update({
      where: { jti: oldJti },
      data: { isUsed: true },
    });
    return mintNewTokens(row.userId, row.familyId);   // writes new jti, returns access + refresh
  });
}
```

Note: the **mark-as-used + insert-new** happens inside one Postgres transaction, so concurrent refresh calls with the same old token cannot both succeed — the second one sees `isUsed = true` and triggers Case 2.

### 5.3 OTP provider

The provider is pluggable. **The real provider is undecided** — user will tell us later. The interface (`OtpProvider`) is the only contract; the factory `getOtpProvider()` is exhaustive-typed, so adding any new provider is a compile-time check.

Selection by env: `OTP_PROVIDER=mock|<whatever>`.

**Today:** `MockOtpProvider` (fixed `123456` for predictable testing). Lives in `backend/src/lib/otp/mock.provider.ts`.

**When a real provider lands:** implement one file (e.g. `backend/src/lib/otp/twilio.provider.ts` or `msg91.provider.ts`), add the case to `getOtpProvider()`, add the new env vars to `config/env.ts`. No other code changes.

**OTP generation policy (real provider):** 6 random digits via `crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')`. Mock bypasses this.

**TTL:** `env.OTP_TTL_SECONDS`, default 300 s.

**OTP storage:** Redis key `otp:{e164}` → value, TTL = TTL. Delete on successful verify (single-use). Mismatch keeps key alive so user can retry until TTL or until verify-attempt limiter kicks in.

### 5.4 Phone validation (handoff from research)

`libphonenumber-js` is the validator:

- **Backend** uses `libphonenumber-js/max` (full type detection — rejects landlines).
- **Mobile** uses `libphonenumber-js/min` (smaller bundle).
- The zod schema (in §9 of `02-FRONTEND-ARCHITECTURE.md`) is **the same shape** on both sides, with the same allow-list.

The backend stores E.164 only. Migration: any pre-existing rows in non-E.164 format get a one-time backfill or are flagged for re-verification. We do **not** silently reformat.

---

## 6. Rate limiting

Single Redis instance, one limiter per use case, all explicit TTLs. All implemented via `rate-limiter-flexible` with the `RedisStore` backend.

| Limiter | Scope | Default policy | Reason |
| --- | --- | --- | --- |
| `otpRequest` | per phone (E.164) | 5 / 15 min, block 1 h | prevent OTP spam / SMS cost blow-up |
| `otpRequest` | per IP | 30 / 1 h | secondary defence behind NAT/proxy |
| `otpVerify` | per phone | 10 / 15 min, block 1 h | brute force |
| `auth` | per IP | 100 / 1 h | generic auth wall |
| `write` | per user | 60 posts / hour, 200 comments / hour, 30 reports / day | content moderation |
| `loginRefresh` | per user | 30 refreshes / hour | detect stolen-refresh loops |
| `upload` | per user | 30 / hour, 5 / min burst | media cost |

Limits are defined in code (env-overridable) so changes are auditable via PR.

**On block**, the limiter returns `AppError(429, RATE_LIMITED, ...)`. The mobile client surfaces this inline — the "Send OTP" button stays disabled with a countdown until reset.

---

## 7. Module-by-module API surface (v1)

> All routes prefixed `/api/v1`.

### 7.1 `auth` (exists, expanded)

| Method | Path | Auth | Body | Returns |
| --- | --- | --- | --- | --- |
| POST | `/auth/request-otp` | – | `{ countryCode, phoneNumber }` | `204` |
| POST | `/auth/verify-otp` | – | `{ countryCode, phoneNumber, otp }` | `{ user, accessToken, refreshToken, isNewUser }` |
| POST | `/auth/refresh` | refresh | – | `{ accessToken, refreshToken }` |
| POST | `/auth/logout` | access | – | `204` (revokes current refresh family) |

### 7.2 `users`

| Method | Path | Auth | Returns |
| --- | --- | --- | --- |
| GET | `/users/me` | access | `{ id, phone, name, avatarUrl, createdAt, stats }` |
| PATCH | `/users/me` | access | body: `{ name?, avatarUrl? }` (v2) |
| GET | `/users/:id` | access | public profile + stats |
| GET | `/users/search?q=` | access | `[{ id, name, avatarUrl }]` (paginated, v2) |

### 7.3 `contacts` (for "Select Contacts" screen)

| Method | Path | Auth | Returns |
| --- | --- | --- | --- |
| POST | `/contacts/sync` | access | body: `{ hashedNumbers: string[] }` — client hashes numbers locally; server hashes again with server pepper, intersects with users table | `[{ id, name, avatarUrl }]` |

**Privacy stance:** the server **never** receives raw phone numbers from a contact sync. The mobile app hashes each contact's number (SHA-256 of E.164 normalised, with a per-install salt that's uploaded once and never reused), then the server re-hashes with a server-side pepper and intersects with `users.phone_hash` (a column we add to the users table — see schema doc).

### 7.4 `posts`

| Method | Path | Auth | Returns |
| --- | --- | --- | --- |
| POST | `/posts` | access | body: `{ caption, groupId, mediaIds[], timerMinutes }` | `{ post }` |
| GET | `/posts/feed` | access | cursor-paginated, includes reveal-status for each |
| GET | `/posts/:id` | access | `{ post, group, timerState, viewerPermissions }` |
| DELETE | `/posts/:id` | access (owner) | `204` |

### 7.5 `groups`

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/groups` | access — body: `{ name, memberIds[] }` |
| GET | `/groups/:id` | access (member) |
| POST | `/groups/:id/invites` | access (member) — body: `{ inviteeIds[] }` |
| POST | `/groups/:id/invites/:inviteId/accept` | access (invitee) |
| POST | `/groups/:id/invites/:inviteId/reject` | access (invitee) |
| GET | `/groups?mine=true` | access — my groups |

### 7.6 `discussions` (timer reveal)

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/discussions/:postId/responses` | access (member of post's group OR post author) | server enforces visibility — returns 403 if not allowed |
| POST | `/discussions/:postId/responses` | access (allowed) | body: `{ body, mediaIds[]? }` |
| GET | `/discussions/:postId/timer` | access (any) | `{ state: 'active' | 'ended', secondsRemaining, endsAt }` |

**The reveal logic is server-side**: even if a client tries to read responses before the timer ends, the server returns 403. This is the security boundary the app is built on.

### 7.7 `reactions`

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/posts/:id/react` | access — body: `{ type: 'like' }` (idempotent) |
| DELETE | `/posts/:id/react` | access |

### 7.8 `comments` (revealed posts only)

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/posts/:id/comments` | access (any, since post is public post-reveal) |
| POST | `/posts/:id/comments` | access — body: `{ body }` |

### 7.9 `notifications`

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/notifications` | access — tabs: all / invites / updates / reports |
| POST | `/notifications/:id/read` | access |

### 7.10 `media`

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/media/upload` | access — multipart (MVP), pre-signed PUT (v1.1) | returns `{ mediaId, url }` |
| DELETE | `/media/:id` | access (owner) |

**MVP storage:** S3 bucket (per user). Backend accepts multipart up to 25 MB, uploads to S3 with the appropriate key, stores the URL in `media.url`. AWS credentials come from env (IAM role preferred over keys — never commit keys).

**Why multipart for MVP:** zero extra infra, no pre-signed URL infrastructure to build. Trade-off: bytes flow through our Node process. 25 MB cap is enough for short videos, audio, pdfs. Bumping above that needs pre-signed URLs.

**v1.1 upgrade:** switch to pre-signed PUT URLs so the mobile app uploads directly to S3, bypassing our Node process entirely. Saves bandwidth and time on slow networks.

### 7.11 `reports`

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/reports` | access — body: `{ targetType: 'post'|'comment'|'user', targetId, reason, details? }` |

### 7.12 `admin` (web-only, NOT consumed by mobile)

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/admin/reports` | admin session |
| POST | `/admin/reports/:id/action` | admin — body: `{ action: 'dismiss'|'warn'|'delete'|'ban', note? }` |

Admin auth uses a separate cookie session (NOT the mobile JWT).

---

## 8. Validation strategy

Every controller starts with one zod parse:

```ts
export async function requestOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const body = requestOtpSchema.parse(req.body);
    await authService.requestOtp(body);
    res.status(204).end();
  } catch (e) { next(e); }
}
```

Validation schemas live in `*.validation.ts` per module. Each schema is unit-testable in isolation.

Phone validation lives in `auth/phone.schema.ts` (see the schema in `02-FRONTEND-ARCHITECTURE.md` §9 / phone-validation handoff). It is reused in:
- `auth.validation.ts` for request-otp and verify-otp
- `users.validation.ts` if/when we add phone-update (v2)

---

## 9. Logging

`pino` JSON logger. Levels: `fatal | error | warn | info | debug | trace`. Production: `info` only.

**Redaction (per CLAUDE.md):**

```ts
// lib/logger.ts
const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  '*.phone',
  '*.otp',
  '*.password',
  '*.token',
  '*.refreshToken',
];
```

Phones logged anywhere except a debug endpoint are pre-masked via `maskPhone()`. The OTP value is **never** logged, even in mock mode.

---

## 10. Security baseline (CLAUDE.md recap, applied)

- **Helmet** on the Express app. CSP set strict in production, lax in dev for HMR.
- **CORS** locked to known origins. Mobile traffic gets a separate allowlist (`http://localhost:8081` for Expo dev, the prod API domain for prod).
- **JWT secret** from env (`JWT_SECRET`), validated to be ≥ 32 chars at boot.
- **Rate limits** on every public endpoint (see §6).
- **Secrets via env only**, validated by zod schema in `config/env.ts` — process refuses to start on missing required vars.
- **No SQL string concatenation**, ever. Prisma raw queries use `$queryRaw` with tagged templates only.
- **Input length caps** enforced in zod for every string field (e.g. captions ≤ 2000 chars, names ≤ 60).
- **CSRF**: not relevant for token-auth JSON APIs. The mobile JWT lives in the Authorization header — no cookies for end-user auth.

---

## 11. Process model

- **Entry**: `node dist/server.js` (production) or `tsx watch src/server.ts` (dev).
- **Graceful shutdown**: SIGTERM → stop accepting new connections → drain in-flight → close Prisma + Redis → exit.
- **Health check**: `GET /healthz` returns `{ ok: true, db: 'ok', redis: 'ok' }`. Used by container orchestrator.
- **Readiness**: `GET /readyz` returns 200 only after migrations are applied.

---

## 12. Test strategy (per CLAUDE.md)

- **Unit (vitest)** for:
  - `auth.service` — OTP generation, verify single-use, new-vs-existing user branching.
  - `phone.schema.ts` — valid mobile, valid number but landline (reject), wrong country (reject), disallowed country (reject).
  - `discussions.service` — visibility check before/after timer ends, race condition where response is submitted in the last second of the timer.
- **Integration (supertest)** for:
  - POST `/auth/request-otp` then POST `/auth/verify-otp` happy path.
  - Refresh-token rotation + reuse detection.
- **No full e2e yet** — per CLAUDE.md, revisit after auth + posts are stable.

---

## 13. Bottlenecks & edge cases (called out by the user)

### 13.1 Bottlenecks

| Bottleneck | Mitigation |
| --- | --- |
| Feed query scans many posts | Cursor-paginate on `(createdAt, id)`; index `(is_published, reveal_ends_at, created_at DESC)`. |
| Contacts sync hashes many numbers | Do the hash + intersect in a single SQL with `WHERE phone_hash IN (...)`. |
| Group reveal at timer-end | Materialise revealed responses via a single `UPDATE … WHERE timer_ends_at <= now()` triggered every minute by a Postgres scheduled function (`pg_cron`) — no separate worker needed. |
| Notification fan-out | For MVP, query-on-read: `GET /notifications` joins recent events. Push notifications (v2) will use FCM/APNs. |

### 13.2 Edge cases

- **OTP requested twice in 1 s**: second request returns 204 silently; first OTP still valid. The Redis SET overwrites — this is intentional, simpler than merge.
- **User loses network mid-publish**: client retries with idempotency key (`POST /posts` with `Idempotency-Key` header). Server caches response for 1 h.
- **Group member removed before timer ends**: existing responses stay visible to the group they were submitted under; the removed member loses visibility immediately.
- **Author deletes post mid-discussion**: hard delete cascades responses; remaining group members get a "post was deleted" notification.
- **Two devices, same account, both post simultaneously**: rate-limiter per user catches obvious abuse; deeper conflict resolution is v2.
- **Timer set to 0 minutes**: backend rejects with `VALIDATION_FAILED` (min 5 minutes).
- **Self-invite to own group**: backend rejects with `VALIDATION_FAILED`.
- **Empty group (all invites rejected)**: post creation requires ≥ 1 accepted invite; backend returns `CONFLICT` with code `GROUP_EMPTY`.

---

## 14. What's explicitly NOT being built

- Message queues (BullMQ, etc.)
- Background worker processes
- Microservice split
- GraphQL gateway
- API versioning beyond the `/v1` prefix (we'll add `/v2` when needed)
- Email provider integration (email sign-in is v2)
- Push notification providers (v2)

These are deliberate omissions per CLAUDE.md's "build for scale, don't build the scale yet" rule. Each has a documented trigger condition for when to add it (see `05-IMPLEMENTATION-ROADMAP.md` §10).