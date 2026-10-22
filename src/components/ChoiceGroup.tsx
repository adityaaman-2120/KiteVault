import { Pressable, Text, View } from 'react-native';

import { touch, useTheme } from '@/theme';

type Props<T extends string | number> = {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

// A labelled row of mutually exclusive choices.
export function ChoiceGroup<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: Props<T>) {
  const { colors, radius, spacing, typography } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ gap: spacing.sm }}>
      <Text style={[typography.label, { color: colors.textMuted }]}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={option.label}
              onPress={() => onChange(option.value)}
              style={{
                minHeight: touch.min,
                justifyContent: 'center',
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.lg,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: selected ? colors.primary : colors.outline,
                backgroundColor: selected ? colors.primary : colors.surface,
              }}
            >
              <Text
                style={[typography.label, { color: selected ? colors.onPrimary : colors.text }]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
