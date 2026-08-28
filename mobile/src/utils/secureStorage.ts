import * as SecureStore from 'expo-secure-store';

/**
 * Thin wrapper over expo-secure-store for the refresh token, user,
 * contact-salt, and biometric-required flag. The access token stays in
 * memory only (zustand); these persist across app launches so cold-start
 * can restore a session, per CLAUDE.md.
 */

const REFRESH_TOKEN_KEY = 'auth.refreshToken';
const USER_KEY = 'auth.user';
const CONTACT_SALT_KEY = 'auth.contactSalt';
const BIOMETRIC_REQUIRED_KEY = 'auth.biometricRequired';

export type StoredUser = {
  id: string;
  phone: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  bio: string | null;
};

export async function getRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    // SecureStore can throw on simulators without a keychain set up.
    // Returning null is safer than crashing the auth boot path.
    return null;
  }
}

export async function setRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
}

export async function clearRefreshToken(): Promise<void> {
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

export async function getStoredUser(): Promise<StoredUser | null> {
  try {
    const raw = await SecureStore.getItemAsync(USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredUser;
    // Defensive: validate shape so a corrupted blob returns null instead
    // of throwing into the auth boot path. The newer fields (username,
    // avatarUrl, bio) are optional — older stored blobs without them
    // still parse, with the missing fields reading back as undefined.
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.id === 'string' &&
      typeof parsed.phone === 'string' &&
      (typeof parsed.name === 'string' || parsed.name === null)
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function setStoredUser(user: StoredUser): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function clearStoredUser(): Promise<void> {
  await SecureStore.deleteItemAsync(USER_KEY);
}

export async function getContactSalt(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(CONTACT_SALT_KEY);
  } catch {
    return null;
  }
}

export async function setContactSalt(salt: string): Promise<void> {
  await SecureStore.setItemAsync(CONTACT_SALT_KEY, salt);
}

export async function clearContactSalt(): Promise<void> {
  await SecureStore.deleteItemAsync(CONTACT_SALT_KEY);
}

export async function getBiometricRequired(): Promise<boolean> {
  try {
    const raw = await SecureStore.getItemAsync(BIOMETRIC_REQUIRED_KEY);
    return raw === 'true';
  } catch {
    return false;
  }
}

export async function setBiometricRequired(value: boolean): Promise<void> {
  await SecureStore.setItemAsync(BIOMETRIC_REQUIRED_KEY, value ? 'true' : 'false');
}

export async function clearBiometricRequired(): Promise<void> {
  await SecureStore.deleteItemAsync(BIOMETRIC_REQUIRED_KEY);
}

/**
 * Convenience: wipes every persisted auth artifact. Per-key deletes are
 * independent — a missing key on one platform should not abort the rest.
 */
export async function clearAllAuthData(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY).catch(() => undefined),
    SecureStore.deleteItemAsync(USER_KEY).catch(() => undefined),
    SecureStore.deleteItemAsync(CONTACT_SALT_KEY).catch(() => undefined),
    SecureStore.deleteItemAsync(BIOMETRIC_REQUIRED_KEY).catch(() => undefined),
  ]);
}
