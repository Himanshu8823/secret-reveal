import { useRef, useState } from 'react';
import { View, TextInput, Alert, type TextInput as TITextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, Pill, Text } from '../../src/components/ui';
import { colors, radius, spacing } from '../../src/theme';
import { useAuth } from '../../src/features/auth/hooks/useAuth';

const OTP_LENGTH = 6;

export default function VerifyOtpScreen() {
  // The login screen passes { countryCode, phoneNumber, e164 }. We re-send
  // countryCode + phoneNumber on confirm — the backend re-validates and
  // the E.164 it derives must match what we passed here. (If the user
  // tampered with route params, the validation fails server-side.)
  const { countryCode, phoneNumber, e164 } = useLocalSearchParams<{
    countryCode: string;
    phoneNumber: string;
    e164: string;
  }>();
  const { confirmOtp } = useAuth();

  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [submitting, setSubmitting] = useState(false);
  const inputs = useRef<(TITextInput | null)[]>([]);

  const setDigit = (i: number, v: string) => {
    // Sanitize: digits only, single char.
    const ch = v.replace(/\D/g, '').slice(0, 1);
    const next = [...digits];
    next[i] = ch;
    setDigits(next);
    if (ch && i < OTP_LENGTH - 1) {
      inputs.current[i + 1]?.focus();
    }
  };

  const onKeyPress = (i: number, key: string) => {
    if (key === 'Backspace' && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
  };

  const onVerify = async () => {
    if (submitting || !countryCode || !phoneNumber) return;
    const otp = digits.join('');
    if (otp.length !== OTP_LENGTH) {
      Alert.alert('Enter the full code', 'Type all 6 digits.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await confirmOtp({ countryCode, phoneNumber, otp });
      // After verify-otp, the first-time flow routes to /(auth)/welcome to
      // collect a display name; returning users (or anyone whose name is
      // already set) skip straight to the app.
      const needsName = !result.user.name || result.user.name.trim() === '';
      router.replace(needsName ? '/(auth)/welcome' : '/(app)');
    } catch (e) {
      const code = (e as { code?: string }).code;
      const message =
        code === 'OTP_EXPIRED'
          ? 'OTP expired. Request a new one.'
          : code === 'OTP_INCORRECT'
            ? 'Incorrect OTP. Try again.'
            : e instanceof Error
              ? e.message
              : 'Could not verify OTP';
      Alert.alert('Verification failed', message);
      setDigits(Array(OTP_LENGTH).fill(''));
      inputs.current[0]?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
      <View className="flex-1 p-6 pt-12">
        <Text variant="h1">Verify your number</Text>
        <Text variant="body" tone="secondary" className="mt-2 mb-8">
          We sent a 6-digit code to {e164 ?? 'your phone'}.
        </Text>

        {__DEV__ ? (
          <Card variant="flat" padding={3} className="mb-6 bg-pill-warning">
            <Pill label="Dev mode — use 123456" tone="warning" withDot />
          </Card>
        ) : null}

        <View className="flex-row justify-between mb-6">
          {digits.map((d, i) => (
            <TextInput
              key={i}
              ref={(el) => {
                inputs.current[i] = el;
              }}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChangeText={(v) => setDigit(i, v)}
              onKeyPress={(e) => onKeyPress(i, e.nativeEvent.key)}
              autoFocus={i === 0}
              selectionColor={colors.brand.primary}
              style={{
                width: 48,
                height: 56,
                borderWidth: 1,
                borderColor: colors.border.DEFAULT,
                borderRadius: radius.md,
                textAlign: 'center',
                backgroundColor: colors.surface.muted,
                fontSize: 22,
                fontWeight: '700',
                color: colors.text.primary,
                marginHorizontal: spacing[1],
              }}
            />
          ))}
        </View>

        <Button
          label="Verify"
          variant="primary"
          size="lg"
          fullWidth
          loading={submitting}
          onPress={onVerify}
        />
      </View>
    </SafeAreaView>
  );
}
