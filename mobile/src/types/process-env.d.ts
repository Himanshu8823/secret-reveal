/**
 * Minimal process.env typing — RN doesn't ship Node types and we don't
 * want @types/node (it's heavy and pulls in Node-only APIs). For our
 * actual runtime env vars, use EXPO_PUBLIC_* (which Expo inlines at
 * build time and types via .expo/types).
 *
 * The NODE_ENV check below is a build-time guard; Expo sets this for
 * us at bundle time.
 *
 * NOTE: this file must NOT have any top-level `export` — it's an ambient
 * declaration. The moment it becomes a module, the `declare const process`
 * stops being global and the TS errors return.
 */
declare const process: {
  env: {
    NODE_ENV: 'development' | 'production' | 'test';
    EXPO_PUBLIC_API_URL?: string;
    EXPO_PUBLIC_SHOW_TOKEN_SANITY?: string;
  };
};