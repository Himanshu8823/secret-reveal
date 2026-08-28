import { useMemo, useState } from 'react';
import { Modal, Pressable, View, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import metadata from 'libphonenumber-js/metadata.full.json';
import { Input, Text } from './ui';
import { colors, spacing } from '@/theme';

/**
 * Tiny replacement for `react-native-country-picker-modal@2.0.0`, which
 * crashes on React 19 + RN 0.81 (the original library is from 2020, uses
 * class `defaultProps` in 10 files, hits a non-configurable property
 * crash inside `VirtualizedList`).
 *
 * Source-of-truth: the `libphonenumber-js` metadata, which is already a
 * runtime dependency. 245 countries, no extra download.
 *
 * API intentionally matches the slice of the old library that
 * `app/(auth)/login.tsx` uses:
 *
 *   <CountryPicker
 *     visible={open}
 *     countryCode="IN"
 *     withFilter
 *     withCallingCode
 *     onClose={() => setOpen(false)}
 *     onSelect={(c) => { setCountry(c); setOpen(false); }}
 *   />
 */

const ALL = (metadata as MetadataFile).countries;
const CC: Record<string, string[]> = (metadata as MetadataFile).country_calling_codes;

export interface PickedCountry {
  cca2: string;
  name: string;
  callingCode: string;
}

type MetadataFile = {
  countries: Record<string, CountryMeta>;
  country_calling_codes: Record<string, string[]>;
};

type CountryMeta = [string, ...unknown[]];

const COUNTRY_NAME: Record<string, string> = {
  IN: 'India', US: 'United States', GB: 'United Kingdom', CA: 'Canada',
  AU: 'Australia', DE: 'Germany', FR: 'France', IT: 'Italy', ES: 'Spain',
  JP: 'Japan', CN: 'China', SG: 'Singapore', AE: 'United Arab Emirates',
  SA: 'Saudi Arabia', BR: 'Brazil', MX: 'Mexico', ZA: 'South Africa',
  NZ: 'New Zealand', IE: 'Ireland', NL: 'Netherlands', BE: 'Belgium',
  CH: 'Switzerland', AT: 'Austria', SE: 'Sweden', NO: 'Norway', FI: 'Finland',
  DK: 'Denmark', PT: 'Portugal', PL: 'Poland', RU: 'Russia', TR: 'Turkey',
  KR: 'South Korea', HK: 'Hong Kong', MY: 'Malaysia', TH: 'Thailand',
  PH: 'Philippines', ID: 'Indonesia', VN: 'Vietnam', PK: 'Pakistan',
  BD: 'Bangladesh', LK: 'Sri Lanka', NP: 'Nepal', EG: 'Egypt', NG: 'Nigeria',
  KE: 'Kenya', IL: 'Israel', AR: 'Argentina', CL: 'Chile', CO: 'Colombia',
  PE: 'Peru', PL_: 'Poland', RO: 'Romania', GR: 'Greece', CZ: 'Czechia',
  HU: 'Hungary', UA: 'Ukraine', CR: 'Costa Rica', PA: 'Panama',
};

interface CountryPickerProps {
  visible: boolean;
  countryCode: string;
  withFilter?: boolean;
  withCallingCode?: boolean;
  withModal?: boolean;
  onClose: () => void;
  onSelect: (country: PickedCountry) => void;
}

function countryToPicked(cca2: string): PickedCountry {
  const meta = ALL[cca2];
  const callingCode = meta ? String(meta[0]) : '';
  return {
    cca2,
    name: COUNTRY_NAME[cca2] ?? cca2,
    callingCode,
  };
}

export function CountryPicker({
  visible,
  countryCode,
  withFilter = true,
  withCallingCode = true,
  onClose,
  onSelect,
}: CountryPickerProps) {
  const [query, setQuery] = useState('');

  // Build a stable, sorted list of countries once.
  const list = useMemo<PickedCountry[]>(() => {
    return Object.keys(ALL)
      .map((cca2) => countryToPicked(cca2))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.cca2.toLowerCase().includes(q) ||
        c.callingCode.includes(q),
    );
  }, [list, query]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent={false}
    >
      <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
          <Text variant="h3">Select country</Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close country picker"
            className="w-10 h-10 items-center justify-center rounded-full active:bg-surface-muted"
          >
            <Ionicons name="close" size={24} color={colors.text.primary} />
          </Pressable>
        </View>

        {withFilter ? (
          <View className="px-4 py-3">
            <Input
              placeholder="Search country or code"
              value={query}
              onChangeText={setQuery}
              autoFocus
              leftSlot={
                <Ionicons
                  name="search"
                  size={18}
                  color={colors.text.secondary}
                />
              }
            />
          </View>
        ) : null}

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.cca2}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const selected = item.cca2 === countryCode;
            return (
              <Pressable
                onPress={() => {
                  onSelect(item);
                  setQuery('');
                }}
                className={`flex-row items-center justify-between px-4 py-3 border-b border-border ${selected ? 'bg-primary-subtle' : 'active:bg-surface-muted'}`}
              >
                <View className="flex-1 min-w-0">
                  <Text variant="body" tone="primary" bold>
                    {item.name}
                  </Text>
                  {withCallingCode ? (
                    <Text variant="caption" tone="secondary" className="mt-0.5">
                      +{item.callingCode} · {item.cca2}
                    </Text>
                  ) : (
                    <Text variant="caption" tone="secondary" className="mt-0.5">
                      {item.cca2}
                    </Text>
                  )}
                </View>
                {selected ? (
                  <Ionicons
                    name="checkmark"
                    size={20}
                    color={colors.brand.primary}
                    style={{ marginLeft: spacing[2] }}
                  />
                ) : null}
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

export type { CountryPickerProps };
