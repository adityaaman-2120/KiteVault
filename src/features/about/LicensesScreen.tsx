import { memo, useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { ScreenContainer } from '@/components';
import { useTheme } from '@/theme';

import { EXTRA_COMPONENTS } from './extraLicenses';
import { LICENSE_TEXTS, LICENSES } from './licenses.generated';

type Row = { key: string; title: string; subtitle: string; body: string };

export const LICENSE_ROWS: Row[] = [
  ...LICENSES.map((l) => ({
    key: `npm:${l.name}`,
    title: l.name,
    subtitle: `${l.version} · ${l.license}`,
    body:
      (l.text >= 0
        ? LICENSE_TEXTS[l.text]!
        : `Licensed under ${l.license}. The library does not include a license file in its package; the full text is at its project page.`) +
      (l.url ? `\n\n${l.url}` : ''),
  })),
  ...EXTRA_COMPONENTS.map((c) => ({
    key: `extra:${c.name}`,
    title: c.name,
    subtitle: c.license,
    body: `${c.note}\n\n${c.url}`,
  })),
];

const keyExtractor = (row: Row) => row.key;

const LicenseRow = memo(function LicenseRow({
  row,
  open,
  onToggle,
}: {
  row: Row;
  open: boolean;
  onToggle: (key: string) => void;
}) {
  const { colors, radius, spacing, typography } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.md,
        padding: spacing.lg,
        gap: spacing.sm,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${row.title}, ${row.subtitle}`}
        onPress={() => onToggle(row.key)}
      >
        <Text style={[typography.body, { color: colors.text }]}>{row.title}</Text>
        <Text style={[typography.caption, { color: colors.textMuted }]}>{row.subtitle}</Text>
      </Pressable>
      {open ? (
        <Text selectable style={[typography.caption, { color: colors.textMuted }]}>
          {row.body}
        </Text>
      ) : null}
    </View>
  );
});

export function LicensesScreen() {
  const { colors, spacing, typography } = useTheme();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const toggle = useCallback(
    (key: string) => setOpenKey((current) => (current === key ? null : key)),
    [],
  );

  return (
    <ScreenContainer>
      <Text style={[typography.caption, { color: colors.textMuted }]}>
        {LICENSE_ROWS.length} components. The libraries listed here have dependencies of their own,
        which are used under their own (mostly MIT) licenses. Tap one to read its license.
      </Text>
      <FlatList
        style={{ flex: 1 }}
        data={LICENSE_ROWS}
        keyExtractor={keyExtractor}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item }) => (
          <LicenseRow row={item} open={openKey === item.key} onToggle={toggle} />
        )}
        extraData={openKey}
      />
    </ScreenContainer>
  );
}
