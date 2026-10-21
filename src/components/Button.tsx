import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/theme';

type Props = {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  // Shows a spinner and ignores presses.
  loading?: boolean;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
}: Props) {
  const { colors, radius, spacing, typography } = useTheme();
  const filled = variant !== 'secondary';
  const accent = variant === 'danger' ? colors.danger : colors.primary;
  const textColor = filled ? colors.onPrimary : accent;
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          borderRadius: radius.md,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.xl,
          gap: spacing.sm,
          backgroundColor: filled ? accent : 'transparent',
          borderColor: accent,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? <ActivityIndicator color={textColor} /> : null}
      <Text style={[typography.label, styles.text, { color: textColor }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    minHeight: 48,
  },
  text: { fontSize: 16 },
});
