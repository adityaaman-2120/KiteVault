import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { LetterAvatar } from '@/components';
import { useTheme } from '@/theme';
import type { Entry } from '@/vault';

import { typeLabel } from './model';

// Rows have a fixed height, which lets the list jump to any position without measuring.
export const ROW_HEIGHT = 68;
export const ROW_GAP = 8;

function subtitle(entry: Entry, folderName: string | undefined): string {
  const main = entry.username || entry.urls[0] || entry.identity?.email || typeLabel(entry.type);
  return folderName ? `${main} · ${folderName}` : main;
}

type Props = {
  entry: Entry;
  folderName?: string;
  // Called with the entry id. Must be a stable function so memo() can skip unchanged rows.
  onOpen: (id: string) => void;
};

export const EntryRow = memo(function EntryRow({ entry, folderName, onOpen }: Props) {
  const { colors, radius, spacing, typography } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${entry.title}, ${subtitle(entry, folderName)}`}
      onPress={() => onOpen(entry.id)}
      style={({ pressed }) => ({
        height: ROW_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
      })}
    >
      <LetterAvatar title={entry.title} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={[typography.body, { color: colors.text }]}>
          {entry.title}
        </Text>
        <Text numberOfLines={1} style={[typography.caption, { color: colors.textMuted }]}>
          {subtitle(entry, folderName)}
        </Text>
      </View>
      {entry.favorite ? (
        <Text accessibilityLabel="Favorite" style={{ color: colors.warning, fontSize: 18 }}>
          ★
        </Text>
      ) : null}
    </Pressable>
  );
});
