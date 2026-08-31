import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

/**
 * Placeholder row for the recent-activity feed. The full cross-group feed
 * is a v1.1 milestone — for Phase 2 we render this neutral card so the
 * Home layout already has room to grow without further plumbing.
 */
export function RecentActivityRow() {
  return (
    <View style={styles.card}>
      <View style={styles.dot} />
      <View style={styles.lines}>
        <Text style={styles.title}>Recent activity</Text>
        <Text style={styles.subtitle}>Your latest posts across groups will appear here.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F6F8',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 9999,
    backgroundColor: colors.brand.primary,
    marginRight: 12,
  },
  lines: { flex: 1 },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.text.secondary,
  },
});
