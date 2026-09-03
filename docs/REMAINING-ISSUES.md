# Remaining Issues — Mobile Codebase Review

Full deep review of `mobile/` was done against CLAUDE.md's rules and
cross-checked with the backend. 20 issues were found in total.

**Fixed:**
- Issue #1 (sign-out not revoking the session) — see `docs/CRITICAL-FIX-signout.md`.
- Issue #7 (missing iOS camera/photo permission strings) — see below.

Everything else below is **not fixed** — kept here as a reference list only.

Three items from the original 20 were determined not to be real issues
after review (#4, #10, #13), and one was already resolved by other work in
the repo (#16) — all four are noted at the bottom, not repeated in the table.

| # | Area/File | Issue | Severity | Why it matters |
|---|---|---|---|---|
| 2 | `mobile/src/api/posts.api.ts` (`toggleReaction`) | Posts to `/posts/:id/reactions`, but the backend has no such route — only `/:id/reactions-any` exists (used by the working `toggleReactionAny`). | High | Dead/broken function; if ever called, 404s in production. |
| 3 | `mobile/src/components/ui/Button.tsx`, `mobile/src/components/ui/Pill.tsx` | Padding classes are built via runtime string interpolation (`` `py-${sz.py}` ``) instead of a static class lookup, unlike the rest of the codebase. | High | NativeWind extracts class names statically at build time — a dynamically interpolated class name can silently fail to generate its styles, risking missing padding on the app's most-used components. |
| 5 | `backend/src/modules/posts/posts.service.ts` | Feed/post responses hardcode `author.username: null` and `author.avatarUrl: null` even though `User.username`/`User.avatarUrl` exist and are populated. | Medium | Every post card's avatar falls back to plain initials forever, even for users with a real profile photo set. |
| 6 | `mobile/src/features/profile/useAvatarUpload.ts` | `pickAndUpload({ source: 'camera' })` requests camera permission but always calls `launchImageLibraryAsync` (gallery), never `launchCameraAsync`. | Medium | Latent bug — currently unreachable since no caller passes `'camera'`, but if wired up, tapping "take photo" would open the gallery instead. |
| 8 | `mobile/app/(app)/post/[id].tsx` | Unexplained unsafe double-cast (`(post as unknown as {...}).viewerRating`) even though `PostDetail.viewerRating` is already a properly typed field. | Medium | Violates CLAUDE.md's "no unsafe cast without a comment explaining why it's unavoidable" — here it's avoidable, the field is already typed. |
| 9 | `mobile/app/(app)/profile/index.tsx` | Same unexplained unsafe-cast pattern for `createdAt`, reading it off a union (`UserProfile \| AuthUser`) via `as unknown as {...}` instead of a type-safe narrowing check. | Medium | Same issue as #8 — defeats strict-mode type checking for no reason. |
| 11 | `mobile/src/api/groups.api.ts` (`sendInvites`) | Backend route `/groups/:id/invites` works, but no screen/component ever calls this client function. | Low | Dead client code, or a missing "invite more people to an existing group" UI — not clear which without asking. |
| 12 | `mobile/src/components/Pill.tsx` vs `mobile/src/components/ui/Pill.tsx` | Two separate `Pill` components exist. The one in `src/components/Pill.tsx` is explicitly commented as a "throwaway primitive" meant to graduate into a real shared one, but a separate `ui/Pill.tsx` was built independently instead. Still imported by `app/index.tsx`'s dev-only sanity-check block. | Low | Dead weight / duplicate component; harmless today since only a dev-gated debug screen uses the throwaway one. |
| 14 | `mobile/src/components/OfflineScreen.tsx`, `mobile/src/components/EmptyState.tsx` | Both use hardcoded hex colors (`#FFFFFF`, `#0B49FA`, `#F5F6F8`, etc.) via `StyleSheet.create` instead of the `colors` tokens from `src/theme`. | Low | Inconsistent with the rest of the app; a future palette change would silently miss these two screens. |
| 15 | `mobile/app/(auth)/verify-otp.tsx` | No resend-OTP button/timer on the OTP screen — the only way to get a new code is to navigate back to login and resubmit the phone number. | Low | UX gap in a core auth flow. *(Note: this was fixed earlier in this session, then reverted along with everything else when the working tree was cleaned back to `main`. It is currently NOT applied — treat this row as still open unless re-applied.)* |
| 17 | `mobile/src/api/client.ts` | Stale TODO comment says `setAccessToken`/`signOut` don't exist on the auth store yet and "the TypeScript check will fail until those exports land" — both already exist and are used via dead `if (fn) {...} else {fallback}` branches. | Low | Misleading comment + unreachable fallback code; harmless but should be cleaned up. |
| 18 | `mobile/app/index.tsx` | Dev-only sanity-check block (gated behind `EXPO_PUBLIC_SHOW_TOKEN_SANITY=1` + non-production) still renders the throwaway `Pill` component, despite its own comment saying "Removed once Home screen exists" — Home already exists. | Low | Leftover debug scaffolding in a production route file; low risk since double-gated. |
| 19 | `mobile/app/(app)/group/[id].tsx`, `mobile/app/(app)/home.tsx` | Stale comments: group-detail's `PostCard onPress` comment says the `/(app)/post/[id]` route "doesn't exist yet" — it already exists and works. Home's "See all" button comment describes a "future" `/feed` route, but just navigates back to `/(app)/home` (a no-op) — and the feed is genuinely capped at 10 posts with no way to see more. | Low | Documentation rot on the first; a real, if minor, product gap on the second — "See all" currently does nothing useful. |
| 20 | `mobile/app/(auth)/legal/privacy.tsx`, `mobile/app/(auth)/legal/terms.tsx` | Placeholder legal text — the code itself says "Replace with your real legal text before shipping to the App Store / Play Store." | Low | Expected/self-flagged, but blocks real app store submission until real legal copy is supplied. |

## Not real issues (no action needed)

- **#4** — `mobile/src/api/media.api.ts` comment claims the backend only
  accepts images; the backend's `ALLOWED_MIME` set actually already
  includes video/pdf/audio too. Determined not to be a real issue on
  review.
- **#13** — `mobile/src/components/RecentActivityRow.tsx` is unused
  (no imports anywhere). Determined not to be an issue worth acting on.
- **#10** — eslint `no-explicit-any` severity + missing husky/lint-staged.
  Determined not to be a real issue.

## Already resolved (no action needed)

- **#16** — `expo-auth-session`, `expo-web-browser`, `expo-crypto` were
  flagged as installed-but-unused. They are now used by
  `mobile/src/features/auth/hooks/useGoogleSignIn.ts` (Google sign-in),
  which was built after the original review.

## Fixed: #7 — missing iOS camera/photo permission strings

`mobile/app.config.ts` had no `NSCameraUsageDescription` /
`NSPhotoLibraryUsageDescription`, despite the app using `expo-image-picker`
(camera + gallery) and `expo-document-picker` for avatar and post-attachment
uploads. Without these, iOS can reject the app at App Store review or
silently deny the permission prompt.

Fixed by adding both packages' own Expo config plugins to the `plugins`
array in `app.config.ts` (purely additive — no existing plugin or config
was touched):

```ts
[
  'expo-image-picker',
  {
    photosPermission: 'Allow $(PRODUCT_NAME) to access your photos to set an avatar or attach media to a post.',
    cameraPermission: 'Allow $(PRODUCT_NAME) to use your camera to take a photo for your avatar or a post.',
  },
],
[
  'expo-document-picker',
  {
    iCloudContainerEnvironment: 'Production',
  },
],
```

Verified: `npx expo config --type public` loads the config cleanly with
both plugins resolved, and `tsc --noEmit` shows zero errors attributable to
`app.config.ts` (the pre-existing, unrelated errors in `CountryPicker.tsx`,
`group/[id].tsx`, and `verify-otp.tsx` are untouched by this change).
