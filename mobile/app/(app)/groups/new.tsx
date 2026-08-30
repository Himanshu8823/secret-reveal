import { useState } from 'react';
import {
  View,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, Input, Text, useDialog } from '../../../src/components/ui';
import { CountryPicker, type PickedCountry } from '../../../src/components/CountryPicker';
import { useQueryClient } from '@tanstack/react-query';
import { createGroup } from '../../../src/api/groups.api';
import { usePhoneValidation } from '../../../src/features/auth/hooks/usePhoneValidation';
import { colors, spacing } from '../../../src/theme';

const DEFAULT_COUNTRY = 'IN';
const MAX_INVITES = 10;

/**
 * Create a new group. Distinct from /(app)/create (which is the post
 * composer) — a separate route per CLAUDE.md's "don't preemptively
 * share" rule, since the inputs and validation are different.
 *
 * Flow:
 *   1. Group name (1..60 chars).
 *   2. Optional list of invite phones (0..10), each validated by the
 *      same libphonenumber-js pipeline as the auth screen.
 *   3. Submit -> POST /groups with phoneNumbers. Backend creates the
 *      Group + pending invites in one transaction.
 */
export default function CreateGroupScreen() {
  const dialog = useDialog();
  const validate = usePhoneValidation();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [country, setCountry] = useState<PickedCountry>({
    cca2: DEFAULT_COUNTRY,
    callingCode: '91',
    name: 'India',
  });
  const [pickerVisible, setPickerVisible] = useState(false);
  const [draftPhones, setDraftPhones] = useState<string[]>(['']);
  const [phoneErrors, setPhoneErrors] = useState<Record<number, string | null>>({});
  const [submitting, setSubmitting] = useState(false);

  const canAddMore = draftPhones.length < MAX_INVITES;

  const updatePhone = (idx: number, value: string) => {
    setDraftPhones((prev) => prev.map((p, i) => (i === idx ? value : p)));
    // Clear any prior error for this row as the user types.
    setPhoneErrors((prev) => ({ ...prev, [idx]: null }));
  };

  const addPhoneRow = () => {
    if (!canAddMore) return;
    setDraftPhones((prev) => [...prev, '']);
  };

  const removePhoneRow = (idx: number) => {
    setDraftPhones((prev) => prev.filter((_, i) => i !== idx));
    setPhoneErrors((prev) => {
      const next: Record<number, string | null> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const ki = Number(k);
        if (ki < idx) next[ki] = v;
        else if (ki > idx) next[ki - 1] = v;
      });
      return next;
    });
  };

  const onSubmit = async () => {
    if (submitting) return;
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      dialog.show({
        variant: 'warning',
        title: 'Name your group',
        message: 'Type a name between 1 and 60 characters.',
        actions: [{ label: 'OK' }],
      });
      return;
    }
    if (trimmedName.length > 60) {
      dialog.show({
        variant: 'warning',
        title: 'Too long',
        message: 'Group names must be at most 60 characters.',
        actions: [{ label: 'OK' }],
      });
      return;
    }

    // Validate every non-empty phone. Drop empties first — the row is
    // optional. Track per-row errors so the user knows which to fix.
    const filledRows = draftPhones
      .map((p, idx) => ({ p: p.trim(), idx }))
      .filter((r) => r.p.length > 0);

    const errors: Record<number, string | null> = { ...phoneErrors };
    const validE164: string[] = [];
    let firstInvalid: number | null = null;

    for (const { p, idx } of filledRows) {
      const result = validate(p, country.cca2);
      if (!result.ok) {
        errors[idx] = result.reason;
        if (firstInvalid === null) firstInvalid = idx;
      } else {
        errors[idx] = null;
        validE164.push(result.e164);
      }
    }
    setPhoneErrors(errors);

    if (firstInvalid !== null) {
      dialog.show({
        variant: 'warning',
        title: 'Check the phone numbers',
        message: 'One or more entries are not valid mobile numbers.',
        actions: [{ label: 'OK' }],
      });
      return;
    }

    // Dedupe phones client-side so the user gets a useful preview of
    // what will actually be sent. Backend also dedupes.
    const deduped = Array.from(new Set(validE164));

    setSubmitting(true);
    try {
      const group = await createGroup({
        name: trimmedName,
        phoneNumbers: deduped,
      });
      // Refresh both lists — the new group is now mine, and there are
      // new pending invites for the phone numbers we sent to.
      queryClient.invalidateQueries({ queryKey: ['groups', 'mine'] });
      queryClient.invalidateQueries({ queryKey: ['invites', 'pending'] });
      queryClient.invalidateQueries({ queryKey: ['users', 'me', 'stats'] });
      // Land on the new group's detail screen.
      router.replace({ pathname: '/(app)/group/[id]', params: { id: group.id } });
    } catch (e) {
      dialog.show({
        variant: 'danger',
        title: 'Could not create group',
        message: e instanceof Error ? e.message : 'Try again',
        actions: [{ label: 'OK' }],
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Suppress unused-mutation-import lint when the import isn't referenced
  // directly (it's only re-exported for future mutation hooks).
  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Top bar — close on the left, submit on the right */}
        <View
          className="h-14 px-4 flex-row items-center justify-between border-b border-border"
          style={{ borderBottomWidth: 0.5 }}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityLabel="Cancel create group"
            className="w-10 h-10 items-center justify-center rounded-full active:bg-surface-muted"
          >
            <Ionicons name="close" size={24} color={colors.text.primary} />
          </Pressable>
          <Text variant="bodyStrong">New group</Text>
          <Pressable
            onPress={onSubmit}
            hitSlop={8}
            disabled={submitting}
            accessibilityLabel="Create group"
            className={[
              'px-3 py-2 rounded-full active:opacity-90',
              submitting ? 'bg-border' : 'bg-primary',
            ].join(' ')}
          >
            <Text variant="bodyStrong" tone={submitting ? 'secondary' : 'onDark'}>
              {submitting ? 'Creating…' : 'Create'}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="p-4 pb-6"
          keyboardShouldPersistTaps="handled"
        >
          <Text variant="h2">Group details</Text>
          <Text variant="meta" tone="secondary" className="mt-1 mb-4">
            Pick a name. You can invite up to {MAX_INVITES} people now; add
            more later from the group screen.
          </Text>

          <Input
            label="Group name"
            placeholder="Friends, Roommates, Project X…"
            value={name}
            onChangeText={setName}
            maxLength={60}
            autoFocus
            returnKeyType="next"
          />

          <View className="h-6" />

          <Text variant="h3">Invite people</Text>
          <Text variant="meta" tone="secondary" className="mt-1 mb-3">
            We'll send each person a notification. They appear as members
            once they accept.
          </Text>

          {draftPhones.map((phone, idx) => (
            <View key={idx} className="mb-3">
              <Input
                placeholder="Phone number"
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={15}
                value={phone}
                onChangeText={(v) => updatePhone(idx, v)}
                errorText={phoneErrors[idx] ?? undefined}
                leftSlot={
                  <Pressable
                    onPress={() => setPickerVisible(true)}
                    className="flex-row items-center pr-3"
                    accessibilityRole="button"
                    accessibilityLabel={`Country code +${country.callingCode}`}
                  >
                    <Text variant="body" tone="primary" bold>
                      +{country.callingCode}
                    </Text>
                    <MaterialCommunityIcons
                      name="chevron-down"
                      size={16}
                      color={colors.text.primary}
                      style={{ marginLeft: spacing[1] }}
                    />
                  </Pressable>
                }
                rightSlot={
                  draftPhones.length > 1 ? (
                    <Pressable
                      onPress={() => removePhoneRow(idx)}
                      accessibilityRole="button"
                      accessibilityLabel="Remove phone"
                      hitSlop={8}
                    >
                      <Ionicons name="close-circle" size={18} color={colors.text.secondary} />
                    </Pressable>
                  ) : null
                }
              />
            </View>
          ))}

          {canAddMore ? (
            <Pressable
              onPress={addPhoneRow}
              accessibilityRole="button"
              accessibilityLabel="Add another invite"
              className="flex-row items-center self-start py-2 px-3 rounded-md active:bg-surface-muted"
            >
              <Ionicons name="add" size={18} color={colors.brand.primary} />
              <Text variant="bodyStrong" tone="link" className="ml-1.5">
                Add another invite ({draftPhones.length}/{MAX_INVITES})
              </Text>
            </Pressable>
          ) : (
            <Text variant="caption" tone="secondary" className="mt-1">
              Max {MAX_INVITES} invites per group at creation.
            </Text>
          )}
        </ScrollView>

        <View className="px-4 pt-3 pb-2">
          <Button
            label="Create group"
            variant="primary"
            size="lg"
            fullWidth
            loading={submitting}
            onPress={onSubmit}
            accessibilityLabel="Confirm create group"
          />
        </View>

        {pickerVisible ? (
          <CountryPicker
            countryCode={country.cca2}
            withFilter
            withCallingCode
            visible={pickerVisible}
            onClose={() => setPickerVisible(false)}
            onSelect={(c) => {
              setCountry({ cca2: c.cca2, callingCode: c.callingCode, name: c.name });
              setPickerVisible(false);
              // Country change invalidates prior validation; clear errors.
              setPhoneErrors({});
            }}
          />
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}