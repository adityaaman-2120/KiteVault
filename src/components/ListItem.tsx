import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/theme';

type Props = { title: string; subtitle?: string; onPress?: () => void };

export function ListItem({ title, subtitle, onPress }: Props) {
  const { colors, radius, spacing, typography } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.md,
        padding: spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[typography.body, { color: colors.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[typography.caption, { color: colors.textMuted }]}>{subtitle}</Text>
        ) : null}
      </View>
      <Text style={[typography.heading, { color: colors.textMuted }]}>›</Text>
    </Pressable>
  );
}
