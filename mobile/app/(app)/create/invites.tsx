import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { colors } from '../../../src/theme/colors';
import { typography } from '../../../src/theme/typography';
import { useComposerStore } from '../../../src/store/composerStore';
import { createGroup, createPost } from '../../../src/api/posts.api';

// ---------------------------------------------------------------------------
// Fixture invitees — contact sync lands later. Five fake users with stable
// ids so the create-group request can carry real-shape memberIds.
// ---------------------------------------------------------------------------

type Fixture = { id: string; name: string };

const FIXTURE_INVITEES: Fixture[] = [
  { id: 'u_fx_anya', name: 'Anya Sharma' },
  { id: 'u_fx_dev', name: 'Dev Patel' },
  { id: 'u_fx_meera', name: 'Meera Iyer' },
  { id: 'u_fx_rohan', name: 'Rohan Mehta' },
  { id: 'u_fx_zara', name: 'Zara Khan' },
];

const GROUP_NAME_MAX = 60;

export default function CreateInvitesScreen() {
  const queryClient = useQueryClient();

  const caption = useComposerStore((s) => s.caption);
  const timerMinutes = useComposerStore((s) => s.timerMinutes);
  const groupName = useComposerStore((s) => s.groupName);
  const invitees = useComposerStore((s) => s.invitees);
  const setGroupName = useComposerStore((s) => s.setGroupName);
  const toggleInvitee = useComposerStore((s) => s.toggleInvitee);
  const reset = useComposerStore((s) => s.reset);

  const [localGroupName, setLocalGroupName] = useState(groupName);
  const [submitting, setSubmitting] = useState(false);

  const canPublish =
    !submitting &&
    localGroupName.trim().length >= 1 &&
    localGroupName.trim().length <= GROUP_NAME_MAX &&
    invitees.length >= 1 &&
    timerMinutes !== null;

  const onBack = () => router.back();
  const onClose = () => router.dismissTo('/(app)/home');

  const onPublish = async () => {
    if (!canPublish) return;
    if (timerMinutes === null) {
      // Defensive — the timer screen enforces this, but never trust state.
      Alert.alert('Pick a timer', 'Go back and choose how long this discussion should run.');
      return;
    }
    setSubmitting(true);
    try {
      const group = await createGroup({
        name: localGroupName.trim(),
        memberIds: invitees.map((i) => i.id),
      });
      await createPost({
        groupId: group.id,
        caption,
        mediaIds: [],
        timerMinutes,
      });
      // Invalidate groups cache so Home refetches when we land there.
      queryClient.invalidateQueries({ queryKey: ['groups', 'mine'] });
      reset();
      router.dismissTo('/(app)/home');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not publish the post.';
      Alert.alert('Publish failed', message);
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
        <View style={styles.topBar}>
          <Pressable
            onPress={onBack}
            hitSlop={12}
            accessibilityLabel="Back"
            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
          >
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <View style={styles.topBarRight}>
            <Text style={styles.stepLabel}>Step 3 of 3</Text>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityLabel="Close create post"
              style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
            >
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Group Invitation</Text>

          {/* Group name */}
          <View style={styles.section}>
            <Text style={styles.label}>Group name</Text>
            <TextInput
              style={styles.input}
              placeholder="Group name"
              placeholderTextColor={colors.textSecondary}
              value={localGroupName}
              onChangeText={(v) => {
                setLocalGroupName(v);
                // Persist into the store as the user types so the back-nav
                // round-trip preserves the value.
                setGroupName(v);
              }}
              maxLength={GROUP_NAME_MAX}
              autoCorrect={false}
            />
          </View>

          {/* Selected chips */}
          {invitees.length > 0 ? (
            <View style={styles.chipsRow}>
              {invitees.map((inv) => (
                <View key={inv.id} style={styles.chip}>
                  <Text style={styles.chipText} numberOfLines={1}>
                    {inv.name}
                  </Text>
                  <Pressable
                    onPress={() => toggleInvitee(inv.id, inv.name)}
                    hitSlop={8}
                    accessibilityLabel={`Remove ${inv.name}`}
                    style={styles.chipRemove}
                  >
                    <Ionicons name="close" size={14} color={colors.textPrimary} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          {/* Invite list */}
          <View style={styles.section}>
            <Text style={styles.label}>Invite people</Text>
            <View style={styles.inviteList}>
              {FIXTURE_INVITEES.map((person) => {
                const isAdded = invitees.some((i) => i.id === person.id);
                return (
                  <View key={person.id} style={styles.inviteRow}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {person.name.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.inviteName} numberOfLines={1}>
                      {person.name}
                    </Text>
                    <Pressable
                      onPress={() => toggleInvitee(person.id, person.name)}
                      accessibilityLabel={
                        isAdded ? `Remove ${person.name}` : `Add ${person.name}`
                      }
                      style={({ pressed }) => [
                        styles.addBtn,
                        isAdded && styles.addBtnAdded,
                        pressed && styles.addBtnPressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.addBtnText,
                          isAdded && styles.addBtnTextAdded,
                        ]}
                      >
                        {isAdded ? 'Added' : 'Add'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
            <Text style={styles.helperText}>
              Contact sync arrives in a later release. For now, pick from this list.
            </Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={onPublish}
            disabled={!canPublish}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
              !canPublish && styles.primaryButtonDisabled,
            ]}
            accessibilityLabel="Publish post"
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Publish</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  flex: { flex: 1 },
  topBar: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
  },
  iconBtnPressed: { backgroundColor: '#F5F6F7' },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 24,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    ...typography.bodyStrong,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary,
    backgroundColor: '#FFFFFF',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
    marginTop: -8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 9999,
    backgroundColor: '#E8EEFE',
    maxWidth: '100%',
  },
  chipText: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    marginRight: 6,
  },
  chipRemove: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    backgroundColor: 'rgba(17,17,17,0.08)',
  },
  inviteList: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 9999,
    backgroundColor: '#E8EEFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
  inviteName: {
    flex: 1,
    ...typography.body,
    fontWeight: '500',
    color: colors.textPrimary,
    marginRight: 12,
  },
  addBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
  },
  addBtnPressed: { backgroundColor: '#F5F6F7' },
  addBtnAdded: {
    borderColor: colors.primary,
    backgroundColor: '#E8EEFE',
  },
  addBtnText: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  addBtnTextAdded: { color: colors.primary },
  helperText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 10,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: '#FFFFFF',
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonPressed: { backgroundColor: colors.primaryPressed },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: {
    ...typography.button,
    color: '#FFFFFF',
  },
});
