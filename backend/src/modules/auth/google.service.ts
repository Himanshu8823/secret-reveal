import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../../config/db.js';
import { env } from '../../config/env.js';
import { AppError, ErrorCode } from '../../lib/AppError.js';
import { signAccessToken } from '../../lib/jwt.js';
import { logger } from '../../lib/logger.js';
import { issueRefresh } from './token.service.js';
import type { AuthUser, GoogleSignInResult } from './auth.types.js';

/**
 * Google Sign-In verification + user resolution.
 *
 * The mobile app runs the OAuth flow itself (expo-auth-session, system
 * browser) and hands us only the resulting Google ID token. We verify that
 * token's signature and audience server-side via google-auth-library
 * against Google's public keys (cached + auto-rotated by the library) —
 * we never trust a client-asserted identity.
 *
 * Client ID audiences: a mobile OAuth flow can present an id_token minted
 * for the iOS, Android, or (Expo AuthSession proxy / web) client ID
 * depending on platform, so we verify against whichever of the configured
 * audiences are present. At least one must be configured or the route is
 * effectively disabled.
 */

let client: OAuth2Client | null = null;

function getClient(): OAuth2Client {
  if (!client) {
    client = new OAuth2Client();
  }
  return client;
}

function configuredAudiences(): string[] {
  return [env.GOOGLE_IOS_CLIENT_ID, env.GOOGLE_ANDROID_CLIENT_ID, env.GOOGLE_WEB_CLIENT_ID].filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  );
}

type GoogleIdentity = {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  avatarUrl: string | null;
};

async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  const audiences = configuredAudiences();
  if (audiences.length === 0) {
    // Misconfiguration, not a client error — surface as 500 so it gets
    // paged rather than silently read as "your token was bad".
    throw new AppError(
      500,
      ErrorCode.INTERNAL,
      'Google sign-in is not configured on this server',
    );
  }

  let ticket;
  try {
    ticket = await getClient().verifyIdToken({ idToken, audience: audiences });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'google id token verification failed');
    throw new AppError(401, ErrorCode.TOKEN_INVALID, 'Invalid Google sign-in token');
  }

  const payload = ticket.getPayload();
  if (!payload || !payload.sub || !payload.email) {
    throw new AppError(401, ErrorCode.TOKEN_INVALID, 'Google token missing required claims');
  }

  // Google recommends rejecting unverified emails for account linking —
  // an unverified email could belong to someone else.
  if (payload.email_verified === false) {
    throw new AppError(401, ErrorCode.TOKEN_INVALID, 'Google email is not verified');
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified ?? false,
    name: payload.name ?? null,
    avatarUrl: payload.picture ?? null,
  };
}

/**
 * Verify a Google ID token, find-or-create the user, and issue our own
 * token pair — mirrors verifyOtp's contract so the mobile client can reuse
 * the same setSession reducer.
 *
 * Resolution order:
 *   1. googleId match → existing Google-linked account, sign in as-is.
 *   2. email match on an account with no googleId yet → link Google to
 *      that account (same person, previously phone-only.. except phone
 *      accounts don't carry email today, so in practice this only fires
 *      for a second Google sign-in attempt that raced account creation).
 *   3. No match → create a brand-new user with phone left null.
 *
 * We deliberately do NOT search for an existing phone-based account by
 * name or any fuzzy signal — email/googleId are the only trustworthy
 * identity keys here.
 */
export async function signInWithGoogle(idToken: string): Promise<GoogleSignInResult> {
  const identity = await verifyGoogleIdToken(idToken);

  let user = await prisma.user.findUnique({ where: { googleId: identity.googleId } });
  let isNewUser = false;

  if (!user) {
    const byEmail = await prisma.user.findUnique({ where: { email: identity.email } });
    if (byEmail && byEmail.googleId === null) {
      user = await prisma.user.update({
        where: { id: byEmail.id },
        data: { googleId: identity.googleId },
      });
    } else if (byEmail) {
      // Email taken by a different Google account — should be impossible
      // given googleId is unique and we just missed it above, but guard
      // against a race between the two reads.
      throw new AppError(409, ErrorCode.VALIDATION_FAILED, 'This Google account is already linked to another user');
    } else {
      isNewUser = true;
      user = await prisma.user.create({
        data: {
          googleId: identity.googleId,
          email: identity.email,
          name: identity.name,
          // Only seeded on signup — never overwritten on subsequent
          // sign-ins so a user's own avatar edit isn't clobbered by
          // Google's photo on the next login.
          avatarUrl: identity.avatarUrl,
        },
      });
      logger.info({ userId: user.id }, 'new user created via google sign-in');
    }
  }

  const authUser: AuthUser = {
    id: user.id,
    phone: user.phone,
    name: user.name,
    username: user.username,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
  };

  const accessToken = signAccessToken({ sub: user.id, phone: user.phone });
  const { token: refreshToken } = await issueRefresh(user.id);

  return {
    isNewUser,
    accessToken,
    refreshToken,
    user: authUser,
    needsPhone: user.phone === null,
  };
}
