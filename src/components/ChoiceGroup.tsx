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
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          columnGap: spacing.sm,
          marginVertical: -5,
        }}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={option.label}
              onPress={() => onChange(option.value)}
              // The pill looks compact, but the area that reacts to a touch is 48dp tall.
              style={{ minHeight: touch.min, justifyContent: 'center' }}
            >
              <View
                style={{
                  paddingVertical: spacing.xs + 1,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? colors.primary : colors.surface,
                }}
              >
                <Text
                  style={[
                    typography.label,
                    {
                      color: selected ? colors.onPrimary : colors.text,
                      fontWeight: selected ? '700' : '500',
                    },
                  ]}
                >
                  {option.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
