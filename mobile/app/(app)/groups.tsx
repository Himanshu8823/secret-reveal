import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../../src/components/EmptyState';
import { colors } from '../../src/theme/colors';

/**
 * Groups tab — Phase 2 placeholder. Home already shows the user's groups;
 * this tab will become an "all groups / discover / search" surface in a
 * later phase. For now it mirrors Home's intent: "no separate groups list
 * yet, but the tab exists so the navigation isn't broken."
 */
export default function GroupsScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Groups</Text>
        <Text style={styles.subtitle}>Your groups are on the Home tab.</Text>
      </View>
      <View style={styles.body}>
        <EmptyState
          iconName="people-outline"
          title="Discover is coming soon"
          subtitle="Browse public and shared groups from this tab in a future release."
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
