import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { Text } from '../../../src/components/ui';
import { spacing } from '../../../src/theme';

/**
 * Privacy Policy. Placeholder content for v1 — sections follow the structure
 * used by real consumer apps (Instagram, WhatsApp, Signal). Replace with
 * your real legal text before shipping to the App Store / Play Store.
 *
 * Renders inside the auth stack so signed-out users can also reach it from
 * the login footer links.
 */
export default function PrivacyPolicyScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
          <Text
            variant="h3"
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            ‹ Back
          </Text>
          <Text variant="bodyStrong" tone="primary">
            Privacy
          </Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView
          contentContainerClassName="px-6 py-6 gap-6"
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-2">
            <Text variant="h1">Privacy Policy</Text>
            <Text variant="meta" tone="secondary">
              Last updated: 28 August 2026
            </Text>
          </View>

          <Section title="1. Introduction">
            <Body>
              {`Welcome to ${'Secretsuper'}. We respect your privacy and are
committed to protecting your personal data. This Privacy Policy explains
how we collect, use, disclose, and safeguard your information when you
use our mobile application.`}
            </Body>
          </Section>

          <Section title="2. Information We Collect">
            <Body>
              We collect information you provide directly to us, such as:
            </Body>
            <Bullet>{'Mobile phone number (used only for OTP authentication)'}</Bullet>
            <Bullet>{'Display name (optional, chosen by you)'}</Bullet>
            <Bullet>{'Content you create within the app (posts, comments, invites)'}</Bullet>
            <Body>
              We do not collect your contacts, location, or device identifiers
              beyond what is required to send you OTP messages and prevent
              abuse.
            </Body>
          </Section>

          <Section title="3. How We Use Your Information">
            <Body>We use the information we collect to:</Body>
            <Bullet>{'Authenticate you via one-time password (OTP)'}</Bullet>
            <Bullet>{'Display your content to people you have shared it with'}</Bullet>
            <Bullet>{'Detect and prevent fraud or abuse'}</Bullet>
            <Bullet>{'Send you notifications you have explicitly opted into'}</Bullet>
          </Section>

          <Section title="4. Data Sharing">
            <Body>
              We do not sell your personal data to third parties. We share
              data only:
            </Body>
            <Bullet>{'With other users, as required by the app (e.g. your posts appear in groups you have joined)'}</Bullet>
            <Bullet>{'With service providers who help us operate the app (e.g. SMS delivery for OTP)'}</Bullet>
            <Bullet>{'When required by law or to protect our legal rights'}</Bullet>
          </Section>

          <Section title="5. Data Retention">
            <Body>
              We retain your account data for as long as your account is
              active. You can request deletion of your account and all
              associated data at any time from the Profile screen.
            </Body>
          </Section>

          <Section title="6. Security">
            <Body>
              We use industry-standard encryption (TLS) for all data in
              transit, and store sensitive data such as authentication
              tokens in platform-secure storage (Apple Keychain on iOS,
              Android Keystore on Android). No method of transmission over
              the internet, however, is 100% secure.
            </Body>
          </Section>

          <Section title="7. Your Rights">
            <Body>
              Depending on your jurisdiction, you may have the right to
              access, correct, delete, or port your personal data. To
              exercise any of these rights, contact us at the address
              below.
            </Body>
          </Section>

          <Section title="8. Children's Privacy">
            <Body>
              Our service is not directed to children under 13. We do not
              knowingly collect personal data from children under 13. If
              you believe we have collected data from a child under 13,
              please contact us so we can delete it.
            </Body>
          </Section>

          <Section title="9. Changes to This Policy">
            <Body>
              We may update this Privacy Policy from time to time. We will
              notify you of any material changes by posting the new policy
              on this page and updating the "Last updated" date above.
            </Body>
          </Section>

          <Section title="10. Contact Us">
            <Body>
              If you have any questions about this Privacy Policy, please
              contact us at:
            </Body>
            <Body tone="link">privacy@secretsuper.app</Body>
          </Section>

          <View style={{ height: spacing[8] }} />
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Text variant="h3">{title}</Text>
      {children}
    </View>
  );
}

function Body({ children, tone = 'primary' as const }: { children: React.ReactNode; tone?: 'primary' | 'secondary' | 'tertiary' | 'onDark' | 'link' | 'danger' | 'success' | 'inherit' }) {
  return (
    <Text variant="body" tone={tone}>
      {children}
    </Text>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View className="flex-row gap-2 pl-2">
      <Text variant="body" tone="primary">
        •
      </Text>
      <Text variant="body" tone="primary" className="flex-1">
        {children}
      </Text>
    </View>
  );
}
