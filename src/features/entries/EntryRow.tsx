import { memo } from 'react';
import { PixelRatio, Pressable, Text, View } from 'react-native';

import { LetterAvatar } from '@/components';
import { useTheme } from '@/theme';
import type { Entry } from '@/vault';

import { typeLabel } from './model';

// Rows have a fixed height, which lets the list jump to any position without measuring.
export const BASE_ROW_HEIGHT = 72;
// Text in a row grows with the phone's font size setting, but only up to this much, so a row
// (which has a fixed height, to keep a 2,000-entry list fast) never cuts its text off.
export const MAX_ROW_FONT_SCALE = 1.5;

export function rowHeight(fontScale: number = PixelRatio.getFontScale()): number {
  return Math.ceil(BASE_ROW_HEIGHT * Math.min(Math.max(fontScale, 1), MAX_ROW_FONT_SCALE));
}
export const ROW_GAP = 10;

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
  const { colors, elevation, isDark, radius, spacing, typography } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${entry.title}, ${subtitle(entry, folderName)}`}
      onPress={() => onOpen(entry.id)}
      style={({ pressed }) => [
        {
          height: rowHeight(),
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingHorizontal: spacing.md,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
        },
        isDark ? null : elevation.card,
      ]}
    >
      <LetterAvatar title={entry.title} size={46} />
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={MAX_ROW_FONT_SCALE}
          style={[typography.body, { color: colors.text, fontWeight: '600' }]}
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
      {entry.totpSecret ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            paddingHorizontal: spacing.sm,
            paddingVertical: 2,
            borderRadius: radius.pill,
            backgroundColor: colors.primarySoft,
          }}
        >
          <Text style={[typography.caption, { color: colors.primary, fontWeight: '700' }]}>
            2FA
          </Text>
        </View>
      ) : null}
      {entry.favorite ? (
        <Text accessibilityLabel="Favorite" style={{ color: colors.warning, fontSize: 18 }}>
          ★
        </Text>
      ) : null}
    </Pressable>
  );
});
