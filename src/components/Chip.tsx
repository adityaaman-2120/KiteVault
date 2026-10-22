import { memo } from 'react';
import { Pressable, Text } from 'react-native';

import { touch, useTheme } from '@/theme';

// A small on/off filter button.
export const Chip = memo(function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors, radius, spacing, typography } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        minHeight: touch.min,
        justifyContent: 'center',
        paddingVertical: spacing.xs + 2,
        paddingHorizontal: spacing.md,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.outline,
        backgroundColor: selected ? colors.primary : colors.surface,
      }}
    >
      <Text style={[typography.label, { color: selected ? colors.onPrimary : colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );
});
