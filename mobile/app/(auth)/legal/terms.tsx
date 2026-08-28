import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { Text } from '../../../src/components/ui';
import { spacing } from '../../../src/theme';

/**
 * Terms of Service. Placeholder content for v1 — sections follow the
 * structure used by real consumer apps. Replace with your real legal text
 * before shipping.
 *
 * Renders inside the auth stack so signed-out users can also reach it from
 * the login footer links.
 */
export default function TermsOfServiceScreen() {
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
            Terms
          </Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView
          contentContainerClassName="px-6 py-6 gap-6"
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-2">
            <Text variant="h1">Terms of Service</Text>
            <Text variant="meta" tone="secondary">
              Last updated: 28 August 2026
            </Text>
          </View>

          <Section title="1. Acceptance of Terms">
            <Body>
              By accessing or using {`Secretsuper`}, you agree to be bound
              by these Terms of Service. If you do not agree, you may not
              use the app.
            </Body>
          </Section>

          <Section title="2. Eligibility">
            <Body>
              You must be at least 13 years old to use {`Secretsuper`}. By
              using the app, you represent that you meet this requirement.
            </Body>
          </Section>

          <Section title="3. Account & Authentication">
            <Body>
              We authenticate you via one-time password (OTP) sent to your
              mobile number. You are responsible for keeping your device
              and SIM secure. We are not liable for unauthorized access
              resulting from loss or compromise of your device.
            </Body>
          </Section>

          <Section title="4. User Content">
            <Body>
              You retain ownership of content you create. By posting
              content, you grant {`Secretsuper`} a non-exclusive,
              royalty-free licence to display that content to other users
              in the groups you have shared it with, and to perform the
              technical operations needed to deliver the service (caching,
              anti-spam scanning, format conversion).
            </Body>
            <Body>
              You must not post content that is illegal, harassing,
              hateful, threatening, defamatory, sexually explicit, or that
              infringes the intellectual property rights of others.
            </Body>
          </Section>

          <Section title="5. Prohibited Conduct">
            <Body>You agree not to:</Body>
            <Bullet>{'Impersonate any person or entity'}</Bullet>
            <Bullet>{'Spam, phish, or otherwise harass other users'}</Bullet>
            <Bullet>{'Attempt to circumvent OTP verification or rate limits'}</Bullet>
            <Bullet>{'Reverse-engineer, decompile, or disassemble the app'}</Bullet>
            <Bullet>{'Use the app for any unlawful purpose'}</Bullet>
          </Section>

          <Section title="6. Termination">
            <Body>
              We may suspend or terminate your account at any time, with or
              without notice, if we reasonably believe you have violated
              these Terms. You may delete your account at any time from
              the Profile screen.
            </Body>
          </Section>

          <Section title="7. Disclaimers">
            <Body>
              The app is provided "as is" and "as available" without
              warranties of any kind, express or implied. We do not
              warrant that the service will be uninterrupted, secure, or
              error-free.
            </Body>
          </Section>

          <Section title="8. Limitation of Liability">
            <Body>
              To the maximum extent permitted by law, {`Secretsuper`} shall
              not be liable for any indirect, incidental, special,
              consequential, or punitive damages, or any loss of profits
              or revenues, whether incurred directly or indirectly, or any
              loss of data, use, or goodwill.
            </Body>
          </Section>

          <Section title="9. Changes to These Terms">
            <Body>
              We may update these Terms from time to time. Continued use of
              the app after a change constitutes acceptance of the new
              terms. Material changes will be communicated via in-app
              notice.
            </Body>
          </Section>

          <Section title="10. Governing Law">
            <Body>
              These Terms shall be governed by the laws of the jurisdiction
              in which {`Secretsuper`} operates, without regard to its
              conflict of law provisions.
            </Body>
          </Section>

          <Section title="11. Contact">
            <Body>
              For questions about these Terms, contact us at:
            </Body>
            <Body tone="link">legal@secretsuper.app</Body>
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
