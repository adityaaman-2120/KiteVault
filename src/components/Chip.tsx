import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { touch, useTheme } from '@/theme';

// A small on/off filter button. The pill looks compact, but the area that reacts to a touch
// is still 48dp tall, which is what Android asks for.
export const Chip = memo(function Chip({
  label,
  selected,
  onPress,
  tone = 'solid',
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  // "soft" marks the choice with a tint instead of a solid fill, for quieter groups of chips.
  tone?: 'solid' | 'soft';
}) {
  const { colors, radius, spacing, typography } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{ minHeight: touch.min, justifyContent: 'center' }}
    >
      <View
        style={{
          paddingVertical: spacing.xs + 1,
          paddingHorizontal: spacing.md,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: selected ? colors.primary : colors.border,
          backgroundColor: !selected
            ? colors.surface
            : tone === 'soft'
              ? colors.primarySoft
              : colors.primary,
        }}
      >
        <Text
          style={[
            typography.label,
            {
              color: !selected ? colors.text : tone === 'soft' ? colors.primary : colors.onPrimary,
              fontWeight: selected ? '700' : '500',
            },
          ]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
});
