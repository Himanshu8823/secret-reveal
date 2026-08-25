# Secretsuper

Cross-platform app with a phone-OTP auth flow. The repo has two apps — no monorepo tooling:

- `backend/` — Node.js + Express + TypeScript API, PostgreSQL via Prisma, Redis for OTP storage and rate-limit counters.
- `mobile/` — Expo (managed) + TypeScript + expo-router. Talks to the backend only via HTTP.

This session covers the project scaffold and a single phone-OTP login/signup flow only. See `CLAUDE.md` for engineering rules.

## Run locally

### 1. Backend

```bash
cd backend
cp .env.example .env       # set DATABASE_URL, REDIS_URL, JWT_*_SECRET
npm install
npx prisma migrate dev --name init
npm run dev                # tsx watch on :4000
```

Smoke test:

```bash
curl -X POST http://localhost:4000/api/v1/auth/otp/request \
  -H 'content-type: application/json' \
  -d '{"phone":"+919999999999"}'
# Server logs: [MOCK OTP] (mock provider never returns the code in the response).

curl -X POST http://localhost:4000/api/v1/auth/otp/verify \
  -H 'content-type: application/json' \
  -d '{"phone":"+919999999999","otp":"123456"}'
```

### 2. Mobile

```bash
cd mobile
cp .env.example .env       # set EXPO_PUBLIC_API_URL=http://localhost:4000/api/v1
npm install
npx expo start
```

For Android emulator, set `EXPO_PUBLIC_API_URL` to `http://10.0.2.2:4000/api/v1` (the emulator's alias for the host).

## What's in this session

- One Postgres model: `User { id, phone, name?, createdAt, updatedAt }`.
- Two endpoints: `POST /api/v1/auth/otp/request`, `POST /api/v1/auth/otp/verify`.
- OTP delivery via an `OtpProvider` interface; `MockOtpProvider` is the active provider (`OTP_PROVIDER=mock`).
- JWT access (15m) + refresh (30d); refresh token persisted to `expo-secure-store`, access token in-memory only.
- Redis-backed rate limits: 3 OTP requests / phone / 10min, 5 / IP / 10min, 5 verify attempts / phone / 10min.
- Two screens: Login (phone + Send OTP, disabled Google button, no email tab) and Verify-OTP (6 digits).
- Stub `(app)/index.tsx` so verify-otp has somewhere to route on success — replace with the real app shell in a later session.

## What's intentionally not in this session

- Twilio / real SMS, Google OAuth, email/password login.
- Profile completion screen.
- Refresh-token rotation endpoint, logout endpoint (Sign Out is wired on the stub only).
- Admin panel, anything past Login / Verify-OTP.
