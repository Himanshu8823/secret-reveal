import { useState } from 'react';
import {
  View,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import CountryPicker, {
  Country,
  CountryCode,
} from 'react-native-country-picker-modal';
import { Button, Input, Text } from '../../src/components/ui';
import { GoogleIcon } from '../../src/components/GoogleIcon';
import { colors, spacing } from '../../src/theme';
import { APP_NAME } from '../../src/config/app';
import { useAuth } from '../../src/features/auth/hooks/useAuth';
import { usePhoneValidation } from '../../src/features/auth/hooks/usePhoneValidation';

// Default to India (+91). The picker is fully functional; users can switch
// country and the dial code is composed from the picker's selection.
const DEFAULT_COUNTRY: CountryCode = 'IN';

/**
 * The country-picker-modal library types `Country` with required fields
 * (region, subregion, currency, flag) that aren't populated by default.
 * For our use we only need cca2, callingCode, name — so we model a slim
 * subset of what the picker actually gives us.
 */
type PickedCountry = Pick<Country, 'cca2' | 'callingCode' | 'name'>;

export default function LoginScreen() {
  const { sendOtp } = useAuth();
  const validate = usePhoneValidation();
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [country, setCountry] = useState<PickedCountry>({
    cca2: DEFAULT_COUNTRY,
    callingCode: ['91'],
    name: 'India',
  });
  const [pickerVisible, setPickerVisible] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const onSendOtp = async () => {
    if (submitting) return;
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
      // Network/server errors — not validation, so an Alert is appropriate.
      Alert.alert('Could not send OTP', e instanceof Error ? e.message : 'Try again');
    } finally {
      setSubmitting(false);
    }
  };

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
                  accessibilityLabel={`Country code +${country.callingCode[0]}`}
                >
                  <Text variant="body" tone="primary" bold>
                    +{country.callingCode[0]}
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
                countryCode={country.cca2 as CountryCode}
                withFilter
                withFlag={false}
                withCallingCode
                withModal
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
                label="Send OTP"
                variant="primary"
                size="lg"
                fullWidth
                loading={submitting}
                onPress={onSendOtp}
              />
            </View>

            <View className="flex-row items-center my-5">
              <View className="flex-1 h-px bg-border" />
              <Text variant="caption" tone="secondary" className="mx-3">
                or continue with
              </Text>
              <View className="flex-1 h-px bg-border" />
            </View>

            <Button
              label="Sign in with Google"
              variant="secondary"
              size="lg"
              fullWidth
              leftSlot={<GoogleIcon size={20} />}
              onPress={() =>
                Alert.alert('Coming soon', 'Google sign-in is not available yet.')
              }
            />
          </View>

          <View className="pt-4 pb-2">
            <Text variant="caption" tone="secondary" className="text-center">
              By continuing, you agree to our{' '}
              <Text
                variant="caption"
                tone="link"
                onPress={() => router.push('/(auth)/login' as never)}
                style={{ textDecorationLine: 'underline' }}
              >
                Terms of Service
              </Text>
              {' & '}
              <Text
                variant="caption"
                tone="link"
                onPress={() => router.push('/(auth)/login' as never)}
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
