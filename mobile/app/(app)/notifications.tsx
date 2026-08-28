import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../../src/components/EmptyState';
import { colors } from '../../src/theme/colors';

/**
 * Phase 2 placeholder. Phase 6 wires real notifications (invites, results
 * available, comments, reports).
 */
export default function NotificationsScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Notifications</Text>
        <Text style={styles.subtitle}>Invites, results, comments, reports.</Text>
      </View>
      <View style={styles.body}>
        <EmptyState
          iconName="bell-outline"
          title="No notifications yet"
          subtitle="Invites and result reveals will show up here."
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
    marginTop: 4,
  },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
