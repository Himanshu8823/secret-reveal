import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { registerPushToken } from '../api/notifications.api';

/**
 * Requests push permission and registers the device's Expo push token with
 * the backend once the user is authenticated. Mounted once near the root
 * (app/(app)/_layout.tsx) alongside useRealtimeNotifications.
 *
 * Deliberately best-effort: a denied permission, a simulator with no push
 * capability, or a failed registration call must never block or crash the
 * app — push is a delivery nicety on top of the in-app + realtime list,
 * not a requirement for the feature to work.
 */
export function usePushRegistration(): void {
  const accessToken = useAuthStore((s) => s.accessToken);
  const registeredForToken = useRef<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    // Only re-run the registration flow once per access token change, not
    // on every re-render — avoids spamming the permission prompt/API call.
    if (registeredForToken.current === accessToken) return;

    let cancelled = false;

    void (async () => {
      // Physical device only — simulators/emulators can't receive push and
      // getExpoPushTokenAsync throws there.
      if (!Device.isDevice) return;

      const existing = await Notifications.getPermissionsAsync();
      let finalStatus = existing.status;
      if (finalStatus !== 'granted') {
        const requested = await Notifications.requestPermissionsAsync();
        finalStatus = requested.status;
      }
      if (finalStatus !== 'granted') return;

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }

      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      const tokenResponse = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined,
      );

      if (cancelled) return;
      await registerPushToken(tokenResponse.data);
      registeredForToken.current = accessToken;
    })().catch(() => {
      // Best-effort — permission denial, no physical device, or a network
      // failure here must never surface to the user.
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);
}
