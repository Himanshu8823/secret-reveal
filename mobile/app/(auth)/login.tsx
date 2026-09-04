import { useEffect, useState } from 'react';
import {
  View,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CountryPicker, type PickedCountry } from '../../src/components/CountryPicker';
import { Button, Input, Text, useDialog } from '../../src/components/ui';
import { colors, spacing } from '../../src/theme';
import { APP_NAME } from '../../src/config/app';
import { useAuth } from '../../src/features/auth/hooks/useAuth';
import { usePhoneValidation } from '../../src/features/auth/hooks/usePhoneValidation';

// Default to India (+91). The picker is fully functional; users can switch
// country and the dial code is composed from the picker's selection.
const DEFAULT_COUNTRY = 'IN';

/**
 * Backend returns a 429 envelope with `error.details.retryAfter` (seconds).
 * The client must render a live countdown so the user can see the cooldown
 * ticking down — and the Send OTP button stays disabled until it expires.
 * Surfacing the static message alone makes the user think the request
 * never recovers.
 */
function extractRetryAfter(e: unknown): number | null {
  if (typeof e !== 'object' || e === null) return null;
  const code = (e as { code?: string }).code;
  if (code !== 'RATE_LIMITED') return null;
  const details = (e as { details?: { retryAfter?: number } }).details;
  const n = details?.retryAfter;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.ceil(n) : null;
}

export default function LoginScreen() {
  const { sendOtp } = useAuth();
  const validate = usePhoneValidation();
  const dialog = useDialog();
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [country, setCountry] = useState<PickedCountry>({
    cca2: DEFAULT_COUNTRY,
    callingCode: '91',
    name: 'India',
  });
  const [pickerVisible, setPickerVisible] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  // `cooldown` is the live retry-after counter, in seconds. Null = no
  // active rate-limit; integer ≥ 1 = button disabled, ticking down.
  const [cooldown, setCooldown] = useState<number | null>(null);

  // Tick the cooldown down every second while it's active. Cleanup the
  // interval on unmount or when the value hits 0.
  useEffect(() => {
    if (cooldown === null || cooldown <= 0) return;
    const id = setInterval(() => {
      setCooldown((prev) => {
        if (prev === null) return null;
        const next = prev - 1;
        if (next <= 0) {
          // Clear the inline error at the same moment the button
          // re-enables so the user sees a clean field.
          setPhoneError(null);
          return null;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const onSendOtp = async () => {
    if (submitting) return;
    if (cooldown !== null) return; // hard block during cooldown
    // 1. Client-side validation. Same library as backend, same rules.
    //    On failure, show inline error and stop — never reaches the wire.
    const result = validate(phone, country.cca2);
    if (!result.ok) {
      setPhoneError(result.reason);
      return;
    }
    setPhoneError(null);
    setSubmitting(true);
    try {
      // 2. Send countryCode + bare national digits. Backend re-validates
      //    and produces the E.164 server-side. We never compose E.164
      //    on the client anymore — single source of truth.
      await sendOtp({ countryCode: country.cca2, phoneNumber: phone });
      // 3. Pass the e164 to the verify screen so it can re-submit on confirm.
      router.push({
        pathname: '/(auth)/verify-otp',
        params: { countryCode: country.cca2, phoneNumber: phone, e164: result.e164 },
      });
    } catch (e) {
      const retryAfter = extractRetryAfter(e);
      if (retryAfter !== null) {
        // Live-countdown dialog. The Dialog component owns the tick
        // and rebuilds the message each second from `format(remaining)`.
        dialog.show({
          variant: 'warning',
          title: 'Too many attempts',
          countdown: {
            from: retryAfter,
            format: (n) => `Try again in ${n}s.`,
            // autoDismiss: true (default) — closes itself when it hits 0.
          },
          actions: [{ label: 'OK' }],
        });
        setCooldown(retryAfter);
        return;
      }
      // Network/server errors — not validation, so a top-level dialog is appropriate.
      dialog.show({
        variant: 'danger',
        title: 'Could not send OTP',
        message: e instanceof Error ? e.message : 'Try again',
        actions: [{ label: 'OK' }],
      });
    } finally {
      setSubmitting(false);
    }
  };

  // What the Send OTP button says and whether it can be tapped.
  const sendButtonLabel = cooldown !== null ? `Wait ${cooldown}s` : 'Send OTP';
  const sendDisabled = submitting || cooldown !== null;

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View className="flex-1 p-6">
          <View className="pt-6 pb-2">
            <Text variant="h1">Welcome Back</Text>
            <Text variant="body" tone="secondary" className="mt-1.5">
              Login to continue to {APP_NAME}
            </Text>
          </View>

          <View className="flex-1 justify-center">
            <Input
              label="Mobile number"
              placeholder="Enter mobile number"
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={15}
              value={phone}
              onChangeText={(v) => {
                setPhone(v);
                if (phoneError) setPhoneError(null);
              }}
              errorText={phoneError ?? undefined}
              leftSlot={
                <Pressable
                  onPress={() => setPickerVisible(true)}
                  className="flex-row items-center pr-3"
                  accessibilityRole="button"
                  accessibilityLabel={`Country code +${country.callingCode}`}
                >
                  <Text variant="body" tone="primary" bold>
                    +{country.callingCode}
                  </Text>
                  <MaterialCommunityIcons
                    name="chevron-down"
                    size={16}
                    color={colors.text.primary}
                    style={{ marginLeft: spacing[1] }}
                  />
                </Pressable>
              }
            />

            {pickerVisible && (
              <CountryPicker
                countryCode={country.cca2}
                withFilter
                withCallingCode
                visible={pickerVisible}
                onClose={() => setPickerVisible(false)}
                onSelect={(c) => {
                  setCountry({
                    cca2: c.cca2,
                    callingCode: c.callingCode,
                    name: c.name,
                  });
                  setPickerVisible(false);
                  if (phoneError) setPhoneError(null);
                }}
              />
            )}

            <View className="mt-6">
              <Button
                label={sendButtonLabel}
                variant="primary"
                size="lg"
                fullWidth
                disabled={sendDisabled}
                loading={submitting}
                onPress={onSendOtp}
              />
            </View>
          </View>

          <View className="pt-4 pb-2">
            <Text variant="caption" tone="secondary" className="text-center">
              By continuing, you agree to our{' '}
              <Text
                variant="caption"
                tone="link"
                onPress={() => router.push('/(auth)/legal/terms')}
                style={{ textDecorationLine: 'underline' }}
              >
                Terms of Service
              </Text>
              {' & '}
              <Text
                variant="caption"
                tone="link"
                onPress={() => router.push('/(auth)/legal/privacy')}
                style={{ textDecorationLine: 'underline' }}
              >
                Privacy Policy
              </Text>
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
