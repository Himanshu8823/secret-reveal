import { useCallback, useRef, useState } from 'react';
import { Pressable, View, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Text, useDialog } from '../../src/components/ui';
import { colors } from '../../src/theme';
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
  const dialog = useDialog();

  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [submitting, setSubmitting] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const inputRef = useRef<TextInput | null>(null);

  /**
   * Industry standard: ONE hidden TextInput that owns the keyboard,
   * caret, autofill, and paste behaviour, paired with N visual boxes
   * that just render the per-character state.
   *
   * Why this beats 6 separate TextInputs:
   *   - The system keyboard stays mounted on a single field, so the
   *     "next box" never steals focus mid-keystroke (this is exactly
   *     what was breaking in the previous 6-input version).
   *   - SMS autofill / iOS oneTimeCode / Android sms-otp autofill
   *     works out of the box (a single input matches the SMS payload).
   *   - Pasting a 6-digit code distributes across all visual boxes
   *     without any per-box keypress plumbing.
   */
  const onChange = useCallback((raw: string) => {
    const sanitized = raw.replace(/\D/g, '').slice(0, OTP_LENGTH);
    const next: string[] = Array(OTP_LENGTH).fill('');
    for (let i = 0; i < sanitized.length; i += 1) {
      next[i] = sanitized[i];
    }
    setDigits(next);
    setFocusedIndex(Math.min(sanitized.length, OTP_LENGTH - 1));
  }, []);

  // Tapping any visual box hands focus back to the hidden TextInput
  // so the system keyboard re-appears. The hidden input's caret is
  // then positioned over the tapped box via `focusedIndex`.
  const focusBox = useCallback((i: number) => {
    setFocusedIndex(i);
    inputRef.current?.focus();
  }, []);

  const onVerify = async () => {
    if (submitting || !countryCode || !phoneNumber) return;
    const otp = digits.join('');
    if (otp.length !== OTP_LENGTH) {
      dialog.show({
        variant: 'warning',
        title: 'Enter the full code',
        message: 'Type all 6 digits.',
      });
      return;
    }
    setSubmitting(true);
    try {
      const result = await confirmOtp({ countryCode, phoneNumber, otp });
      // Welcome screen runs when EITHER the display name OR the username
      // is missing — they are both collected on first onboarding and
      // either could be left blank if the user closed the app mid-flow.
      const needsName =
        !result.user.name ||
        result.user.name.trim() === '' ||
        !result.user.username ||
        result.user.username.trim() === '';
      router.replace(needsName ? '/(auth)/welcome' : '/(app)');
    } catch (e) {
      const code = (e as { code?: string }).code;
      const title =
        code === 'OTP_EXPIRED'
          ? 'OTP expired'
          : code === 'OTP_INCORRECT'
            ? 'Incorrect OTP'
            : 'Verification failed';
      const message =
        code === 'OTP_EXPIRED'
          ? 'Request a new one and try again.'
          : code === 'OTP_INCORRECT'
            ? 'The code you entered is wrong. Try again.'
            : e instanceof Error
              ? e.message
              : 'Could not verify OTP';
      const variant: 'warning' | 'danger' =
        code === 'OTP_EXPIRED' || code === 'OTP_INCORRECT' ? 'warning' : 'danger';
      dialog.show({
        variant,
        title,
        message,
        actions: [{ label: 'OK' }],
      });
      setDigits(Array(OTP_LENGTH).fill(''));
      setFocusedIndex(0);
      inputRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
      <View className="flex-1 px-6 pb-6 gap-6">
        <View className="gap-2 !pt-40">
          <Text variant="h1">Verify your number</Text>
          <Text variant="body" tone="secondary">
            We sent a 6-digit code to {e164 ?? 'your phone'}.
          </Text>
        </View>

        <View className="gap-6">
          {/*
            Hidden TextInput: owns the keyboard, caret, autofill, and
            paste. Absolutely positioned at opacity 0 so it sits on top
            of the visual boxes — the user sees boxes, but the input
            is unified. `caretHidden` because we draw our own cursor
            indicator via the focused box's border ring.
          */}
          <View className="relative w-full">
            <TextInput
              ref={inputRef}
              value={digits.join('')}
              onChangeText={onChange}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={OTP_LENGTH}
              autoFocus
              caretHidden
              // iOS: surface the SMS one-time-code suggestion above the
              // keyboard so the user can tap-to-fill.
              textContentType="oneTimeCode"
              // Android: equivalent — drive the SMS-OTP autofill.
              autoComplete="sms-otp"
              importantForAutofill="yes"
              // The hidden input is full-bleed so taps anywhere in the
              // row of boxes open the keyboard.
              className="absolute inset-0 text-transparent"
              style={{ fontSize: 1 }}
              accessibilityLabel="One-time code"
            />

            {/* Visual boxes. Tapping a box hands focus to the hidden
                input and updates `focusedIndex` so the caret / ring
                lines up with the tapped slot. */}
            <View className="flex-row gap-2 w-full" pointerEvents="box-none">
              {digits.map((d, i) => {
                const isFocused = i === focusedIndex;
                const borderClass = isFocused
                  ? 'border-primary'
                  : d
                    ? 'border-border-strong'
                    : 'border-border';
                return (
                  <Pressable
                    key={i}
                    onPress={() => focusBox(i)}
                    className={`flex-1 aspect-square items-center justify-center border rounded-md bg-surface-muted ${borderClass}`}
                  >
                    <Text
                      variant="h2"
                      tone="primary"
                      className="text-center"
                    >
                      {d}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
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
      </View>
    </SafeAreaView>
  );
}
