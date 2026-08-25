import * as SecureStore from 'expo-secure-store';

/**
 * Thin wrapper over expo-secure-store for the refresh token. The access
 * token stays in memory only (zustand); refresh token is the only one
 * worth persisting across app launches, per CLAUDE.md.
 */

const REFRESH_TOKEN_KEY = 'auth.refreshToken';

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
