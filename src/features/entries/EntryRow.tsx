import { memo } from 'react';
import { PixelRatio, Pressable, Text, View } from 'react-native';

import { LetterAvatar } from '@/components';
import { useTheme } from '@/theme';
import type { Entry } from '@/vault';

import { typeLabel } from './model';

// Rows have a fixed height, which lets the list jump to any position without measuring.
export const BASE_ROW_HEIGHT = 68;
// Text in a row grows with the phone's font size setting, but only up to this much, so a row
// (which has a fixed height, to keep a 2,000-entry list fast) never cuts its text off.
export const MAX_ROW_FONT_SCALE = 1.5;

export function rowHeight(fontScale: number = PixelRatio.getFontScale()): number {
  return Math.ceil(BASE_ROW_HEIGHT * Math.min(Math.max(fontScale, 1), MAX_ROW_FONT_SCALE));
}
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
        height: rowHeight(),
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
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={MAX_ROW_FONT_SCALE}
          style={[typography.body, { color: colors.text }]}
        >
          {entry.title}
        </Text>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={MAX_ROW_FONT_SCALE}
          style={[typography.caption, { color: colors.textMuted }]}
        >
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
