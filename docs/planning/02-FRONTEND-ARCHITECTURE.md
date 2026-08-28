# NEXORA — Frontend Architecture & Design System

> **Stack:** Expo SDK 54, React Native 0.81.5, React 19.1, expo-router 6, NativeWind (Tailwind for RN), zustand for client state, axios for HTTP.
> **Folder:** `D:/secret-reveal/mobile/`.
> **Source-of-truth for:** folder layout, components, design-token mapping to Tailwind, screen-by-screen build order.

---

## 1. Folder Layout (target state)

```
mobile/
├── app/                          # expo-router routes
│   ├── _layout.tsx               # root provider tree (SafeArea, NativeWindProvider, AuthGate)
│   ├── index.tsx                 # redirects to /(auth)/login or /(app)/home
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── login.tsx             # screen 2
│   │   └── verify-otp.tsx        # not in references, required by flow
│   ├── (app)/
│   │   ├── _layout.tsx           # tab nav: Home / Groups / Create / Notifications / Profile
│   │   ├── home.tsx              # screen 3 — groups-first: list of groups + recent activity
│   │   ├── groups.tsx            # alternative tab view of the user's groups (v1 may mirror home)
│   │   ├── group/                # screen 3a
│   │   │   ├── _layout.tsx
│   │   │   └── [id].tsx          # group detail — that group's posts
│   │   ├── create/               # screens 4 → 8
│   │   │   ├── _layout.tsx       # modal-style stack
│   │   │   ├── index.tsx         # screen 4
│   │   │   ├── contacts.tsx      # screen 5
│   │   │   ├── invites.tsx       # screen 6
│   │   │   ├── group-exists.tsx  # screen 7 (modal)
│   │   │   └── timer.tsx         # screen 8
│   │   ├── post/
│   │   │   └── [id]/
│   │   │       ├── index.tsx     # screen 9 (Hidden Discussion)
│   │   │       ├── countdown.tsx # screen 10
│   │   │       └── results.tsx   # screen 11
│   │   ├── media/[id].tsx        # screen 12
│   │   ├── report.tsx            # screen 13
│   │   ├── notifications.tsx     # screen 14
│   │   ├── profile/
│   │   │   ├── _layout.tsx
│   │   │   ├── [userId].tsx      # screen 15
│   │   │   └── edit.tsx          # v2
│   │   └── settings.tsx          # screen 17
│   └── (admin)/                  # NOT IN MOBILE — admin is web-only
├── src/
│   ├── api/
│   │   ├── client.ts             # axios instance + interceptors
│   │   ├── auth.api.ts
│   │   ├── posts.api.ts
│   │   ├── groups.api.ts
│   │   ├── notifications.api.ts
│   │   ├── reports.api.ts
│   │   └── uploads.api.ts
│   ├── components/               # shared primitives (UI only, no business logic)
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Avatar.tsx
│   │   ├── Chip.tsx
│   │   ├── Pill.tsx
│   │   ├── Card.tsx
│   │   ├── IconButton.tsx
│   │   ├── Sheet.tsx             # bottom sheet wrapper
│   │   ├── Modal.tsx
│   │   ├── Toast.tsx
│   │   ├── Skeleton.tsx
│   │   ├── EmptyState.tsx
│   │   ├── GoogleIcon.tsx        # (exists)
│   │   └── Pressable.tsx         # typed wrapper with active state
│   ├── features/                 # business logic per feature (per CLAUDE.md)
│   │   ├── auth/
│   │   │   ├── hooks/useAuth.ts          # (exists)
│   │   │   ├── hooks/usePhoneValidation.ts
│   │   │   └── types.ts                  # (exists)
│   │   ├── posts/
│   │   │   ├── components/PostCard.tsx
│   │   │   ├── components/StoryRing.tsx
│   │   │   ├── components/MediaOptionGrid.tsx
│   │   │   ├── hooks/usePostComposer.ts
│   │   │   ├── hooks/useHiddenDiscussion.ts
│   │   │   └── types.ts
│   │   ├── groups/
│   │   ├── notifications/
│   │   └── reports/
│   ├── hooks/                    # shared cross-feature hooks (use only if used 2×)
│   │   ├── useDebounce.ts
│   │   └── useCountdown.ts
│   ├── store/
│   │   ├── authStore.ts          # (exists — zustand)
│   │   ├── composerStore.ts      # multi-step create-post state
│   │   └── notificationStore.ts
│   ├── theme/
│   │   ├── colors.ts             # TS tokens (kept in sync with tailwind.config.js)
│   │   ├── typography.ts
│   │   └── spacing.ts
│   ├── utils/
│   │   ├── secureStorage.ts      # (exists)
│   │   ├── phone.ts              # E.164 normalisation using libphonenumber-js
│   │   ├── time.ts               # "2h ago" formatting + countdown math
│   │   └── classnames.ts         # `cn()` helper if needed; NativeWind handles most
│   └── config/
│       └── app.ts                # (exists)
├── assets/
│   └── images/
│       ├── splash.png            # (replaces splash screen)
│       ├── logo.png
│       └── placeholders/
│           ├── post-sunset.jpg
│           ├── post-palms.jpg
│           └── post-cove.jpg
├── app.config.ts                 # (exists — add plugin entries)
├── babel.config.js               # NEW — NativeWind + Reanimated preset
├── metro.config.js               # NEW — NativeWind transformer
├── tailwind.config.js            # NEW
├── global.css                    # NEW
├── nativewind-env.d.ts           # NEW
├── tsconfig.json                 # (exists)
└── package.json                  # (exists)
```

### Promotion rule (per CLAUDE.md)

A component lives in `src/components/` only if it's used in ≥ 2 features. Otherwise it stays inside `src/features/<x>/components/`. **Do not preemptively promote.**

---

## 2. NativeWind (Tailwind) Setup — pinned version plan

> **Stack verified against this exact project:** Expo SDK 54.0, RN 0.81.5, React 19.1, expo-router 6.0.24, Reanimated 4.1.x, `newArchEnabled: true`.

### 2.1 Why NativeWind

NativeWind lets us write utility classes (`bg-primary rounded-md px-6`) that compile to native styles. It is the only Tailwind flavour that works on React Native (not webview-based). It pairs cleanly with our existing StyleSheet code during migration.

### 2.2 Version decision: **NativeWind v4.2.6**

| Option | Verdict |
| --- | --- |
| NativeWind v4 (`4.2.6` on `latest`) | ✅ **Chosen.** Production-ready, Tailwind v3, well-tested path with SDK 54. |
| NativeWind v5 (`5.0.0-preview.4`) | ❌ Preview only; the package itself says "not intended for production use." Has the *least* community testing with SDK 54. |

**Honest caveat:** this exact combination (SDK 54 + RN 0.81.5 + Reanimated 4.1 + NativeWind 4.2.6) has not been boot-tested by anyone on the team. Configuration below is the textbook v4 setup with the SDK54 + Reanimated 4 fixes layered on. It is high-confidence but not 100 % guaranteed — first boot may need a Metro cache clear.

### 2.3 Install commands

```bash
# from D:/secret-reveal/mobile/
pnpm add nativewind@^4.2.6
pnpm add -D tailwindcss@^3.4.17 prettier-plugin-tailwindcss@^0.5.11 babel-preset-expo clsx
```

- **`prettier-plugin-tailwindcss@^0.5.11`** (not 0.8.x) — 0.8 supports Tailwind v4; we are on v3.
- **`clsx`** is optional but recommended during migration — it makes conditional class strings readable while `StyleSheet` code still exists.

### 2.3 babel.config.js (new file)

**Critical:** `react-native-worklets/plugin` (not `react-native-reanimated/plugin`) is the Reanimated 4 plugin and it **must be last**. If it's missing or out of order, worklets fail at runtime with confusing "Tried to call X on a non-worklet" errors.

```js
// D:/secret-reveal/mobile/babel.config.js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      // MUST be last. Reanimated 4 moved the plugin into the worklets package.
      'react-native-worklets/plugin',
    ],
  };
};
```

### 2.4 metro.config.js (new file)

```js
// D:/secret-reveal/mobile/metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);
module.exports = withNativeWind(config, { input: './global.css' });
```

### 2.5 tailwind.config.js (new file)

Mirrors `00-DESIGN-TOKENS-EXTRACTION.md` §10. Imports from the existing `src/theme/colors.ts` so the TS tokens stay the single source of truth.

```js
// D:/secret-reveal/mobile/tailwind.config.js
const { colors } = require('./src/theme/colors');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  darkMode: 'class', // 'class' strategy for future programmatic dark-mode toggle
  theme: {
    extend: {
      colors: {
        primary: colors.primary,              // #0B49FA
        'primary-pressed': colors.primaryPressed,
        background: colors.background,
        text: {
          DEFAULT: colors.textPrimary,
          primary: colors.textPrimary,
          secondary: colors.textSecondary,
        },
        border: colors.border,
        'google-border': colors.googleButtonBorder,
      },
      borderRadius: {
        // Four-radius rule: 8 / 12 / 16 / full
        sm: 8,
        md: 12,
        lg: 16,
        xl: 20, // for FAB / sheet handle only; refer tokens doc
        full: 9999,
      },
    },
  },
  plugins: [],
};
```

> **Naming note:** `border-border` is legal but ugly. During the token-name sweep we can rename `colors.border` → `colors.divider` and `border-border` → `border-divider`. Tracked as a v2 polish item.

### 2.6 global.css (new file)

```css
/* D:/secret-reveal/mobile/global.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### 2.7 nativewind-env.d.ts (new file)

```ts
/* D:/secret-reveal/mobile/nativewind-env.d.ts */
/// <reference types="nativewind/types" />
```

> Don't name it `nativewind.d.ts` (collides with package folder) or `app.d.ts` (collides with `/app`).

### 2.8 app/_layout.tsx delta

Add `import '../global.css';` as the **very first line** of the file, before any other import:

```tsx
import '../global.css';   // ← FIRST LINE
import { Stack } from 'expo-router';
// … rest unchanged
```

**No `NativeWindProvider` needed.** The babel preset handles class registration globally.

### 2.9 app.config.ts — no changes

For SDK 54, no NativeWind plugin entry is required in `app.config.ts`. The existing `plugins: ['expo-router', 'expo-secure-store']` is correct. `userInterfaceStyle: 'light'` is fine while we're light-only; flip to `'automatic'` when dark mode ships.

### 2.10 TypeScript — no override needed

`nativewind-env.d.ts` adds the `className` prop via declaration merging to every JSX intrinsic. No `components.d.ts` override is required. Verify with `pnpm tsc` after install.

### 2.11 Single-shot install script

```bash
cd D:/secret-reveal/mobile

# 1. Install
pnpm add nativewind@^4.2.6
pnpm add -D tailwindcss@^3.4.17 prettier-plugin-tailwindcss@^0.5.11 babel-preset-expo clsx

# 2. Create config files (paste content from §2.3–2.7 above)
#    - babel.config.js
#    - metro.config.js
#    - tailwind.config.js
#    - global.css
#    - nativewind-env.d.ts

# 3. Edit app/_layout.tsx: prepend `import '../global.css';`

# 4. Restart Metro with cleared cache (any babel/metro change needs this)
pnpm start --clear

# 5. Type-check
pnpm tsc
```

### 2.12 Migration order

1. Install + configure NativeWind on a **fresh, throwaway component** (e.g. a new `<Pill />` in `src/components/`).
2. Verify `className="bg-primary rounded-md px-4 py-3"` renders correctly.
3. Port **one existing screen** end-to-end (the splash screen, which is simple) to validate the dev loop.
4. Port `LoginScreen` (screen 2) — already a known, working screen.
5. From here, **port each new screen directly in NativeWind**; don't port old screens one-by-one.
6. Delete the now-unused StyleSheet blocks once a screen is fully migrated.

### 2.13 Common pitfalls on Expo SDK 54

1. **Metro cache after babel changes.** Any edit to `babel.config.js` or `metro.config.js` requires `pnpm start --clear`. Otherwise you'll see ghost "Reanimated plugin missing" errors from the stale transform.
2. **`react-native-worklets/plugin` MUST be last** in the `plugins` array. Babel evaluates plugins in order. The package name is `react-native-worklets`, not `react-native-reanimated` — that was the v3 path.
3. **`nativewind/babel` is a preset, not a plugin.** It belongs in the `presets` array. Putting it in `plugins` will silently no-op.
4. **New Architecture is required.** Already on (`newArchEnabled: true` in `app.config.ts`). NativeWind v4 supports both, but Reanimated 4 only works on the new arch.
5. **Hot reload lies occasionally.** A new utility class sometimes doesn't trigger Fast Refresh. Fix: full reload (`r` in Expo CLI, or shake → Reload).
6. **Don't run `npx tailwindcss init`.** It creates a TS config with the wrong shape. Use the `tailwind.config.js` from §2.5 verbatim.
7. **`react-native-worklets@^0.12.1` peer warning.** npm metadata says it wants RN 0.83–0.87, but we are on 0.81.5. This is fine: Reanimated 4.1.x ships `react-native-worklets` transitively, and that's what actually runs. The warning is expected; ignore it unless install actually breaks.
8. **`userInterfaceStyle: 'light'`** is set in `app.config.ts`. With `darkMode: 'class'` strategy this is fine (class strategy ignores OS). When dark mode ships, either flip to `'automatic'` (media strategy) or keep `'light'` (class strategy is unchanged).

---

## 3. Component Primitives — contracts

These are the shared UI primitives. Implement once, used everywhere.

### 3.1 `<Button>`

```tsx
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';
type Props = {
  title: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
};
```

Visual:
- **primary** → `bg-primary text-white rounded-md px-6 py-4` — height ≈ 52 px
- **secondary** → `bg-surface-muted text-text-primary rounded-md px-6 py-4`
- **ghost** → `bg-transparent text-primary`
- **danger** → `bg-danger text-white rounded-md px-6 py-4`

Sizes: `sm` = py-2 px-4, `md` = py-3 px-5, `lg` = py-4 px-6 (default).

### 3.2 `<Input>`

```tsx
type Props = {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  hint?: string;
  leftSlot?: ReactNode;     // e.g. country code chip
  rightSlot?: ReactNode;
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
  secureTextEntry?: boolean;
  autoFocus?: boolean;
};
```

Visual: `border border-border rounded-md px-4 py-3.5 bg-white`. Focus → `border-primary`. Error → `border-danger` + red helper text below. **Never** uses anything other than `rounded-md`.

### 3.3 `<Avatar>`

```tsx
type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
type Props = { uri?: string; name?: string; size?: Size; ring?: 'violet' | 'pink' | 'amber' | 'teal' | 'none' };
```

Always `rounded-full`. Story ring variant uses a 2-px gradient border.

### 3.4 `<Chip>` / `<Pill>`

- **Chip**: tappable, used for multi-select pills in "Select Contacts" (screen 5).
- **Pill**: static, used for status labels (Hidden Discussion, Accepted, Pending).

```tsx
type ChipProps = { label: string; selected?: boolean; onPress: () => void; removable?: boolean };
type PillProps = { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' };
```

### 3.5 `<Card>`

```tsx
type Props = { children: ReactNode; onPress?: () => void; padded?: boolean };
```

Default: `bg-white rounded-lg elevation-1`. `padded` adds `p-4`.

### 3.6 `<Sheet>` (bottom sheet)

Wraps `@gorhom/bottom-sheet` (NOT YET INSTALLED — add to deps). Used for screens 4, 9, 13, 17.

### 3.7 `<Toast>`

Uses `react-native-toast-message` (add to deps). For "OTP sent" / "Post published" feedback.

---

## 4. Screen Build Order (matches roadmap)

| Phase | Screens | Reference image |
| --- | --- | --- |
| **P1 — Auth** | 1, 2, verify-otp | `01` rows 1–2 |
| **P2 — Home (groups-first)** | 3, 3a | `02-home-feed-detail.png` (reused as inspiration; home is now groups not stories) |
| **P3 — Create post** | 4, 6, 7, 8 | `01` rows 2 (right), row 3 |
| **P4 — Hidden discussion + reveal** | 9, 10, 11 | `01` row 5 + `06-hidden-discussion-detail.png` for screen 9 |
| **P5 — Media + reporting** | 12, 13 | `01` rows 5–6 |
| **P6 — Notifications + profile + settings** | 14, 15, 17 | `01` row 6 + row 7 |
| **P7 — Admin web (out of mobile)** | 16 | `01` row 6 (admin) |

---

## 5. State Management

| State | Owner | Why |
| --- | --- | --- |
| Auth session (access + refresh tokens, user object, contactSalt) | `zustand` (memory) + `expo-secure-store` (refresh, user, salt) | Survives app reload; bootstrap reads secure-store on cold start |
| Create-post composer (multi-step) | `zustand` store (no persistence) | Lost on app kill is fine; resumes within session |
| Server-cached data (posts, feed) | TanStack Query (recommend adding) | Caching, retries, optimistic updates; works well with axios |
| Notifications | `zustand` + polling every 30s (push in v2) | Cheap, no FCM complexity yet |
| Settings toggles | AsyncStorage (or backend user prefs) | Persist |
| Biometric-required flag | Secure-store | Per-device, security-sensitive |

**TanStack Query addition rationale:** Right now we have no client cache. With a feed, post details, comments, and notifications to manage, hand-rolled loading/error states will balloon. `@tanstack/react-query` is the standard — add it in P2 when we first render the home feed.

---

## 5.1 Session persistence — how every real mobile app behaves

A real mobile app **remembers the user**. Close it, kill it from the app switcher, reboot the phone — open it again and you're still in. Access tokens expire in 15 minutes and the user never sees a login screen because the app quietly swaps in a fresh one. Open Instagram after a week, open Gmail on a new device, open WhatsApp on a friend's phone with your number — they're already in. That is the baseline, not a stretch goal.

NEXORA will behave the same way. The persistence plumbing is **mandatory from v1**, not a "we'll add it later" footnote. The pieces below describe how a production mobile session is built; none of them are optional.

### 5.1.1 The auth state machine

The app is in exactly one of these states at any time:

```
┌──────────────┐
│   LOADING    │  ← boot: reading secure-store + calling /auth/refresh
└──────┬───────┘
       │
       ▼
┌──────────────┐         ┌──────────────────┐
│ UNAUTHENTICATED│◀──────│   OFFLINE         │
└──────┬───────┘  retry │ (network error,    │
       │                 │  user can retry)   │
       │ OTP verify      └──────────────────┘
       ▼
┌──────────────┐
│ AUTHENTICATED│  ← valid access token in memory
└──────┬───────┘
       │ access expires / 401
       ▼
┌──────────────┐
│  REFRESHING  │  ← in-flight /auth/refresh (transient)
└──────┬───────┘
       │
       ├─ success → AUTHENTICATED
       └─ failure → UNAUTHENTICATED
```

The user only ever sees **Splash**, **Home**, or **Login** in normal use. OFFLINE and REFRESHING are internal states — the UI hides them behind skeleton loaders, never a login prompt.

### 5.1.2 What lives in which storage

| Data | Storage | Why |
| --- | --- | --- |
| Access token | Memory only (zustand) | Short TTL (15 min); never on disk |
| Refresh token | `expo-secure-store` (iOS Keychain / Android Keystore) | Encrypted at rest, gated by device PIN/biometric |
| User profile (id, name, phone, avatarUrl) | `expo-secure-store` as JSON | Needed to render UI before any network call |
| `contactSalt` | `expo-secure-store` | Per-user; required for contact hashing client-side |
| Biometric-required flag | `expo-secure-store` | Toggles whether the unlock screen shows on cold start |
| Onboarding flags ("seen splash") | `AsyncStorage` | Not sensitive; needs to be fast |
| Theme preference | `AsyncStorage` | Same |
| Last-known notifications timestamp | `AsyncStorage` | Cheap read for the polling loop |

**Rule:** if the data is required for *authentication* or *identity*, secure-store. If it's *preferences* or *caching*, AsyncStorage. Never put a token in AsyncStorage.

### 5.1.3 Cold-start bootstrap

```ts
// src/features/auth/boot.ts
import { getRefreshToken, setRefreshToken, clearRefreshToken } from '../../utils/secureStorage';
import { useAuthStore } from '../../store/authStore';
import { refresh } from '../../api/auth.api';

export type AuthBootResult =
  | { state: 'loading' }
  | { state: 'authenticated' }
  | { state: 'unauthenticated' }
  | { state: 'offline'; error: unknown };

export async function bootstrapAuth(): Promise<AuthBootResult> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return { state: 'unauthenticated' };

  try {
    const { accessToken, refreshToken: newRefresh, user } = await refresh(refreshToken);
    // CRITICAL: write the new refresh token BEFORE clearing the old one.
    // A crash mid-rotation leaves us with the new (valid) token, not signed out.
    await setRefreshToken(newRefresh);
    useAuthStore.getState().setSession({ accessToken, user, isNewUser: false });
    return { state: 'authenticated' };
  } catch (e) {
    if (isAuthError(e)) {
      await clearRefreshToken();
      return { state: 'unauthenticated' };
    }
    return { state: 'offline', error: e };
  }
}
```

### 5.1.4 Root index — what the user sees on launch

```tsx
// app/index.tsx
import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { bootstrapAuth, type AuthBootResult } from '../src/features/auth/boot';
import { SplashScreen } from '../src/components/SplashScreen';
import { OfflineScreen } from '../src/components/OfflineScreen';

export default function RootIndex() {
  const [boot, setBoot] = useState<AuthBootResult>({ state: 'loading' });

  useEffect(() => {
    bootstrapAuth().then(setBoot);
  }, []);

  switch (boot.state) {
    case 'loading':
      return <SplashScreen />;
    case 'offline':
      return (
        <OfflineScreen
          onRetry={() => bootstrapAuth().then(setBoot)}
        />
      );
    case 'authenticated':
      return <Redirect href="/(app)" />;
    case 'unauthenticated':
      return <Redirect href="/(auth)/login" />;
  }
}
```

`<SplashScreen />` is the same component as the brand splash (screen 1) — logo + tagline, ≤ 1 s on warm network. The user should rarely see this for more than a heartbeat.

### 5.1.5 Axios interceptor — silent background refresh

While the user is browsing the feed, the access token expires. The next API call gets a 401. The user should never see a login screen — the app should swap in a fresh token and retry, invisibly.

A **single-flight** pattern is critical. Otherwise 5 stale requests each kick off their own refresh and one of them races the others:

```ts
// src/api/client.ts (excerpt)
let refreshInFlight: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const token = await getRefreshToken();
    if (!token) return null;
    try {
      const { accessToken, refreshToken: newRefresh } = await refresh(token);
      await setRefreshToken(newRefresh);
      useAuthStore.getState().setAccessToken(accessToken);
      return accessToken;
    } catch {
      await clearRefreshToken();
      useAuthStore.getState().signOut();
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

client.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (error.response?.status !== 401 || original._retry) throw error;
    original._retry = true;
    const newToken = await tryRefresh();
    if (!newToken) throw error;
    original.headers.Authorization = `Bearer ${newToken}`;
    return client.request(original);
  },
);
```

### 5.1.6 Biometric lock on cold start (ships in v1.1, designed in v1)

Modern banking apps, WhatsApp, Telegram — they all do this. Architecture supports it from day one; the toggle UI ships in Phase 6 (Settings) but the unlock screen component is built in Phase 0.4.

```
App launches → LOADING
   ↓
If biometric_required: true (per-user toggle in secure-store)
   ↓
Show <BiometricGateScreen />
   ↓
expo-local-authentication.authenticateAsync({ biometricOnly: true })
   ↓
   ├─ success → AUTHENTICATED branch (continue normal bootstrap)
   ├─ fail × 3 → fall back to OTP login
   └─ user cancels → keep showing the gate
```

For v1 we ship `biometric_required = false` by default; the toggle is in Settings (screen 17) and persisted to secure-store.

Library: `expo-local-authentication` (NOT YET INSTALLED — add in Phase 6).

### 5.1.7 Multi-account support (ships in v1.1, designed in v1)

Telegram, Gmail, Instagram all let users switch accounts without re-entering OTP. Architecture now (so we don't retrofit later):

- Secure-store keys become namespaced: `auth.refreshToken.<userId>`, `auth.user.<userId>`, `auth.contactSalt.<userId>`.
- One extra key: `auth.activeUserId` — points to the currently-active account.
- Auth state machine gains a `switchAccount(userId)` action.

For v1 we ship single-account only, with the keys already structured as if multi-account were live. No future migration needed.

### 5.1.8 What this changes in today's code

| File | Today | After Phase 0.4 |
| --- | --- | --- |
| `app/index.tsx` | reads in-memory token, always redirects to login on cold start | calls `bootstrapAuth()`, renders loading / offline / redirect |
| `app/_layout.tsx` | no gate | unchanged (gating happens in `index.tsx`) |
| `src/store/authStore.ts` | in-memory only | adds `signOut()` that clears secure-store; adds `setAccessToken` separate from `setSession` |
| `src/utils/secureStorage.ts` | only refresh token | adds `getUser`, `setUser`, `clearUser`, `getContactSalt`, `setContactSalt`, `getBiometricRequired`, `setBiometricRequired` |
| `src/api/auth.api.ts` | `requestOtp`, `verifyOtp` | adds `refresh(refreshToken)` |
| `src/api/client.ts` | request interceptor only | adds response interceptor with single-flight refresh |

### 5.1.9 Tests required

- Cold start with valid refresh token → reaches `/(app)` (mocked `/auth/refresh` returns 200)
- Cold start with no refresh token → reaches `/(auth)/login`
- Cold start with expired refresh token → `/auth/refresh` 401 → clears secure-store → reaches login
- Cold start with network error → renders `<OfflineScreen />` with retry
- Two concurrent 401s → only one `/auth/refresh` fires (single-flight)
- Mid-rotation crash → next boot still has the new refresh token

Backend tests cover reuse detection (covered in §5.2 of the backend doc).

---

## 6. API Client

`src/api/client.ts` — single axios instance:

```ts
const client = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1',
  timeout: 15_000,
});

// Request: attach access token
client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response: on 401, try refresh once, then retry. On second 401, sign out.
let refreshing: Promise<string | null> | null = null;
client.interceptors.response.use(
  (r) => r,
  async (error) => {
    if (error.response?.status !== 401) throw error;
    if (!refreshing) refreshing = useAuthStore.getState().refresh();
    const newToken = await refreshing;
    refreshing = null;
    if (!newToken) { useAuthStore.getState().signOut(); throw error; }
    error.config.headers.Authorization = `Bearer ${newToken}`;
    return client.request(error.config);
  },
);
```

All API modules export pure functions:

```ts
// src/api/posts.api.ts
export const getFeed = (cursor?: string) =>
  client.get<PostList>('/posts', { params: { cursor } }).then((r) => r.data.data);
```

---

## 7. Phone validation (handoff to research agent)

The plan once the library decision lands:

1. **Backend**: zod schema uses `libphonenumber-js` `isValidPhoneNumber` against an E.164 default region (derive from `+CC` prefix). Add a `.transform()` that normalises to E.164.
2. **Mobile**: `src/utils/phone.ts` exports `validatePhone(input: string, region: CountryCode): { ok: true, e164: string } | { ok: false, reason: string }` using the same library. Display error inline below the input, never as an `Alert.alert`.
3. **Shared package consideration**: not today. Per CLAUDE.md, only extract a shared package when the duplication is real and painful.

---

## 8. OTP flow (handoff to research agent — Twilio-shaped)

Current provider: `MockOtpProvider` (fixed OTP `123456`). The contract for the real provider (Twilio Verify or Twilio Programmable Messaging + self-managed codes):

```ts
// src/lib/otp/twilio.provider.ts (future, NOT in MVP)
export class TwilioOtpProvider implements OtpProvider {
  async sendOtp(phone: string, otp: string): Promise<void> {
    // 1. If using Twilio Verify: don't generate OTP — call verify.services().verifications.create({ to, channel: 'sms' })
    // 2. If self-managed: messages.create({ to, body: `Your NEXORA code is ${otp}` })
    //    For India: requires DLT-registered template with entity ID + template ID; pass via env.
    //    OTP is logged masked; we still store it in Redis for our own verify endpoint.
  }
}
```

Selection remains env-driven (`OTP_PROVIDER=mock|twilio`). When Twilio lands:

1. Add `@twilio/sdk` to backend deps.
2. Implement `TwilioOtpProvider` — must satisfy the existing `OtpProvider` interface, so no other code changes.
3. Add new env vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` (if Verify), DLT IDs (if India SMS).
4. Update `getOtpProvider()` switch — TypeScript exhaustiveness check will surface the missing case at compile time.

Until Twilio is wired up, the mock provider shows an **in-app banner** ("Dev mode — use 123456") on the verify-otp screen so it's impossible to forget.

---

## 9. Navigation Patterns

- **Tab nav** (bottom): Home / Groups / Create / Notifications / Profile. The "Create" tab is a **center FAB-style** button that opens screen 4 as a modal sheet. Same pattern as the reference image 3.
- **Modal sheets** (slide-up): screens 4, 5, 6, 7, 9, 10, 11, 13.
- **Full-screen pushes**: profile, settings, media viewer.

expo-router config:

- `(app)/_layout.tsx` defines `Tabs` with the bottom tab bar.
- `(app)/create/_layout.tsx` defines a `Stack` with `presentation: 'modal'` so it slides up over the home tab.

---

## 10. Performance & UX targets

- **First paint** after OTP verify ≤ 1 s (skeleton + cached feed on warm start).
- **Tap-to-feedback** ≤ 100 ms (use `Pressable` + active state, no async work before animation).
- **Skeleton screens** for feed, post detail, notifications — never blank views.
- **Image loading**: `expo-image` (add to deps) for progressive loading + placeholder blur. Far better than `<Image>`.

---

## 11. Accessibility (baseline, not full WCAG yet)

- All interactive elements have `accessibilityLabel` and `accessibilityRole`.
- Color is never the only signal — pills have text + colour.
- Touch targets ≥ 44 × 44 px.
- Dynamic type: scale via `allowFontScaling` (default true) but cap with `maxFontSizeMultiplier` 1.5 to prevent breakage.

---

## 12. Testing (mobile)

Per CLAUDE.md, we don't set up full e2e. What we *do* set up:

- **Unit (vitest)**: phone validation, time formatting, store reducers.
- **Component (React Native Testing Library)**: Button, Input, Pill — once.
- **Manual smoke**: every screen once per phase on both iOS and Android via Expo Go.

Detox is the v2 candidate.

---

## 12.5 Brand centralisation (rebrand in one file)

User has not locked the brand name yet. Currently we use **NEXORA** everywhere. To make a future rebrand a one-file change:

### 12.5.1 Mobile — `mobile/src/config/app.ts`

```ts
export const APP_NAME = 'NEXORA';
export const APP_TAGLINE = 'Share Privately. Connect Deeply.';
export const APP_SHORT_DESCRIPTION = 'Hidden discussions, revealed on your terms.';
```

All screens import from here:

```tsx
import { APP_NAME, APP_TAGLINE } from '../src/config/app';
// …
<Text style={styles.header}>Welcome Back</Text>
<Text style={styles.subtitle}>Login to continue to {APP_NAME}</Text>
```

Grep check before any rebrand PR: `grep -r "NEXORA" mobile/src mobile/app` should return only `config/app.ts`. Any other hit is a regression.

### 12.5.2 Backend — `backend/src/config/brand.ts`

```ts
export const BRAND = {
  name: 'NEXORA',
  tagline: 'Share Privately. Connect Deeply.',
  supportEmail: 'support@nexora.example',
  legalUrl: 'https://nexora.example/terms',
} as const;
```

Returned to the mobile app as part of `/users/me`:

```json
{
  "user": { "id": "...", "phone": "..." },
  "brand": { "name": "NEXORA", "tagline": "..." }
}
```

This way if branding changes server-side (admin update, white-label for an enterprise customer), the app picks it up on next login.

### 12.5.3 What stays hardcoded (deliberately)

- The wordmark font weight / letter-spacing in `styles` (typography choices are design decisions, not brand identity)
- The blue gradient hex (`#0B49FA` → `#01125C`) — token-level, lives in `00-DESIGN-TOKENS-EXTRACTION.md` and `tailwind.config.js`
- Logo PNG / SVG (asset file, not config)
- App store names (`app.config.ts` `name` and `ios.bundleIdentifier` / `android.package`) — these are configured per environment

### 12.5.4 Renaming process (when it happens)

1. Edit `mobile/src/config/app.ts` and `backend/src/config/brand.ts`.
2. Update `app.config.ts` `name` field.
3. Update `app.config.ts` splash image assets under `mobile/assets/images/`.
4. Update `package.json` `name` field on both backend and mobile (mostly cosmetic but matters for npm scripts).
5. Run `grep -r "NEXORA" .` and verify only the brand config files + intentional marketing copy still match.

---

## 13. Open questions

**All product decisions from the kickoff conversation are now resolved.** No open questions. If something new comes up during build that requires a user call, log it in `docs/planning/DECISIONS.md` (to be created when the first such question arises) so the history is preserved.

### 13.1 Resolved decisions (locked)

| Question | Answer |
| --- | --- |
| Story creation in v1? | **No — stories are out of scope.** NEXORA is not Instagram. Home is groups-first; posts are private to groups. The reference images showed story rings, but we explicitly exclude them. |
| Splash screen — show every launch? | **Yes — every launch.** No skip-on-warm-start. The NEXORA logo + tagline show for ≤ 1 s on every cold start. |
| Group name — auto-generated or user-typed? | **User must type it.** Screen 6 (Group Invitation) has a text input for the group name. No auto-generated names. |
| Comments + reactions on revealed posts? | **Yes — in v1.** The reveal screen (11) is interactive: post body, all responses, comment thread, like button. **Three distinct actions: comment, react, like.** All stored, all rendered. |
| Roles? | **Two only: User and Admin.** User is creator + viewer; Admin is reserved in DB (`users.isAdmin`) but unused in v1. |
| Email tab on Login screen? | **No — not implemented.** Mobile/OTP only. Email sign-in is v2. |
| Web client in MVP? | **No — mobile only (iOS + Android).** |
| Cloud storage? | **AWS S3.** Multipart upload for MVP (cap 25 MB), pre-signed URLs as v1.1 upgrade. |
| Brand name flexibility? | **Centralised.** `mobile/src/config/app.ts` + `backend/src/config/brand.ts`. |
| Test depth? | **Test-lite.** Auth, phone, visibility checks get unit tests; manual smoke for the rest. |
| Reference screen changes? | **None.** The 17 reference images (minus stories) + `06-hidden-discussion-detail.png` are the target. |
| Hosting? | **AWS.** Managed Postgres + managed Redis + S3. Pricing out of scope. |
| Public posting (no group)? | **No — every post belongs to a group.** Group is implicit during the create flow. |