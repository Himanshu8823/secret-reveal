import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import CountryPicker, {
  Country,
  CountryCode,
} from 'react-native-country-picker-modal';
import { GoogleIcon } from '../../src/components/GoogleIcon';
import { colors } from '../../src/theme/colors';
import { APP_NAME } from '../../src/config/app';
import { useAuth } from '../../src/features/auth/hooks/useAuth';

// Default to India (+91). The picker is fully functional; users can switch
// country and the dial code is composed from the picker's selection.
const DEFAULT_COUNTRY: CountryCode = 'IN';

export default function LoginScreen() {
  const { sendOtp } = useAuth();
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [country, setCountry] = useState<Country>({
    cca2: DEFAULT_COUNTRY,
    callingCode: ['91'],
    name: 'India',
  });
  const [pickerVisible, setPickerVisible] = useState(false);

  const onSendOtp = async () => {
    if (submitting) return;
    const dialCode = country.callingCode[0];
    const fullPhone = `+${dialCode}${phone}`;
    if (!/^\+[1-9]\d{6,14}$/.test(fullPhone)) {
      Alert.alert('Invalid phone', 'Enter a valid mobile number.');
      return;
    }
    setSubmitting(true);
    try {
      await sendOtp(fullPhone);
      router.push({ pathname: '/(auth)/verify-otp', params: { phone: fullPhone } });
    } catch (e) {
      Alert.alert('Could not send OTP', e instanceof Error ? e.message : 'Try again');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          <View style={styles.headerWrap}>
            <Text style={styles.header}>Welcome Back</Text>
            <Text style={styles.subtitle}>Login to continue to {APP_NAME}</Text>
          </View>

          <View style={styles.body}>

            <View style={styles.phoneRow}>
              <Pressable
                style={styles.countryCode}
                onPress={() => setPickerVisible(true)}
              >
                <Text style={styles.countryCodeText}>+{country.callingCode[0]}</Text>
                <MaterialCommunityIcons
                  name="chevron-down"
                  size={16}
                  color={colors.textPrimary}
                  style={styles.countryChevron}
                />
              </Pressable>
              <View style={styles.phoneDivider} />
              <TextInput
                style={styles.phoneInput}
                placeholder="Enter mobile number"
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={15}
                value={phone}
                onChangeText={setPhone}
              />
            </View>

            {pickerVisible && (
              <CountryPicker
                countryCode={country.cca2 as CountryCode}
                withFilter
                withFlag={false}
                withCallingCode
                withModal
                visible={pickerVisible}
                onClose={() => setPickerVisible(false)}
                onSelect={(c) => {
                  setCountry(c);
                  setPickerVisible(false);
                }}
              />
            )}

            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
                submitting && styles.primaryButtonDisabled,
              ]}
              onPress={onSendOtp}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>Send OTP</Text>
              )}
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or continue with</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.googleButton,
                pressed && styles.googleButtonPressed,
              ]}
              onPress={() =>
                Alert.alert('Coming soon', 'Google sign-in is not available yet.')
              }
            >
              <View style={styles.googleIconWrap}>
                <GoogleIcon size={20} />
              </View>
              <Text style={styles.googleButtonText}>Sign in with Google</Text>
            </Pressable>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              By continuing, you agree to our{' '}
              <Text
                style={styles.link}
                onPress={() => router.push('/(auth)/login' as never)}
              >
                Terms of Service
              </Text>
              {' & '}
              <Text
                style={styles.link}
                onPress={() => router.push('/(auth)/login' as never)}
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  flex: { flex: 1 },
  container: {
    flex: 1,
    padding: 24,
  },
  headerWrap: {
    paddingTop: 24,
    paddingBottom: 8,
  },
  header: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: colors.textPrimary,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '400',
    color: colors.textSecondary,
    marginTop: 6,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    marginBottom: 20,
  },
  countryCode: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 14,
    width: 64,
  },
  countryCodeText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  countryChevron: {
    marginLeft: 4,
  },
  phoneDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
  },
  phoneInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: '400',
    color: colors.textPrimary,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonPressed: { backgroundColor: colors.primaryPressed },
  primaryButtonDisabled: { opacity: 0.7 },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 22,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.textSecondary,
    marginHorizontal: 12,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.googleButtonBorder,
    borderRadius: 12,
    paddingVertical: 13,
  },
  googleButtonPressed: { backgroundColor: '#F5F6F7' },
  googleIconWrap: {
    marginRight: 10,
  },
  googleButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  footer: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  footerText: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  link: {
    color: colors.primary,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
});