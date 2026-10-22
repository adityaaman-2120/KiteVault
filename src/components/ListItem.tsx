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
        borderRadius: radius.lg,
        padding: spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[typography.body, { color: colors.text, fontWeight: '600' }]}>{title}</Text>
        {subtitle ? (
          <Text style={[typography.caption, { color: colors.textMuted }]}>{subtitle}</Text>
        ) : null}
      </View>
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: radius.pill,
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={[typography.label, { color: colors.primary }]}>›</Text>
      </View>
    </Pressable>
  );
}
