import type { ExpoConfig } from 'expo/config';

// Expo managed workflow config. Public env vars must be prefixed with
// EXPO_PUBLIC_ to be readable in the app bundle at runtime.
const config: ExpoConfig = {
  name: 'Secretsuper',
  slug: 'secretsuper',
  scheme: 'secretsuper',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.secretsuper.app',
  },
  android: {
    package: 'com.secretsuper.app',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    // No custom icon/color override — falls back to the app icon until a
    // dedicated notification-icon asset is designed.
    'expo-notifications',
  ],
  experiments: {
    typedRoutes: false,
  },
  extra: {
    router: {
      origin: false,
    },
    eas: {
      projectId: '70be77d6-3eaf-415e-9b9b-47c4910971d7',
    },
  },
};

export default config;
