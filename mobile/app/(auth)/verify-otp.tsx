import { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { useAuth } from '../../src/features/auth/hooks/useAuth';

const OTP_LENGTH = 6;

export default function VerifyOtpScreen() {
  // Phone comes from navigation params — NOT global state — per the kickoff.
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const { confirmOtp } = useAuth();

  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [submitting, setSubmitting] = useState(false);
  const inputs = useRef<(TextInput | null)[]>([]);

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
    if (submitting || !phone) return;
    const otp = digits.join('');
    if (otp.length !== OTP_LENGTH) {
      Alert.alert('Enter the full code', 'Type all 6 digits.');
      return;
    }
    setSubmitting(true);
    try {
      await confirmOtp(phone, otp);
      // Route into the (app) group. Stub for now — see plan note.
      router.replace('/(app)');
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
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>Verify your number</Text>
        <Text style={styles.subtitle}>
          We sent a 6-digit code to {phone ?? 'your phone'}.
        </Text>

        <View style={styles.otpRow}>
          {digits.map((d, i) => (
            <TextInput
              key={i}
              ref={(el) => {
                inputs.current[i] = el;
              }}
              style={styles.otpCell}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChangeText={(v) => setDigit(i, v)}
              onKeyPress={(e) => onKeyPress(i, e.nativeEvent.key)}
              autoFocus={i === 0}
              selectionColor={colors.primary}
            />
          ))}
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.primaryButtonPressed,
            submitting && styles.primaryButtonDisabled,
          ]}
          onPress={onVerify}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Verify</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 48 },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: 32,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  otpCell: {
    width: 48,
    height: 56,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    textAlign: 'center',
    ...typography.h2,
    color: colors.textPrimary,
    backgroundColor: '#FAFAFB',
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonPressed: { backgroundColor: colors.primaryPressed },
  primaryButtonDisabled: { opacity: 0.7 },
  primaryButtonText: {
    ...typography.button,
    color: '#fff',
  },
});
