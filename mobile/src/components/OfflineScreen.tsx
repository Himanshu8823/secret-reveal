import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

type Props = {
  onRetry: () => void;
  retrying?: boolean;
  errorMessage?: string;
};

/**
 * Shown by app/index.tsx when bootstrapAuth() returns { state: 'offline' }.
 * Network is unreachable, or the server returned a non-auth error during
 * the cold-start refresh attempt. User can retry; we don't navigate to login
 * because we don't yet know whether the user has a valid session.
 */
export function OfflineScreen({ onRetry, retrying = false, errorMessage }: Props) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons
            name="cloud-off-outline"
            size={56}
            color={colors.textSecondary}
          />
        </View>

        <Text style={styles.title}>Can't reach NEXORA</Text>
        <Text style={styles.subtitle}>
          We couldn't connect to the server. Check your connection and try again.
        </Text>

        {errorMessage ? (
          <Text style={styles.detail} numberOfLines={3}>
            {errorMessage}
          </Text>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.retryButton,
            pressed && styles.retryButtonPressed,
            retrying && styles.retryButtonDisabled,
          ]}
          onPress={onRetry}
          disabled={retrying}
        >
          {retrying ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.retryButtonText}>Retry</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 9999, // full — circle per token rule
    backgroundColor: '#F5F6F8', // surface.muted
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },
  detail: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 24,
    fontFamily: 'monospace', // mono-styled for error text
  },
  retryButton: {
    marginTop: 32,
    backgroundColor: '#0B49FA', // primary
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    minWidth: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonPressed: { backgroundColor: '#0940D6' },
  retryButtonDisabled: { opacity: 0.7 },
  retryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});