import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/theme';

type Props = {
  options: { label: string; selected: boolean; onPress: () => void }[];
};

// A row of connected options, for switching between views of the same list.
export function SegmentedControl({ options }: Props) {
  const { colors, radius, typography } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        padding: 4,
        borderRadius: radius.pill,
        backgroundColor: colors.surfaceMuted,
      }}
    >
      {options.map((option) => (
        <Pressable
          key={option.label}
          accessibilityRole="button"
          accessibilityLabel={option.label}
          accessibilityState={{ selected: option.selected }}
          onPress={option.onPress}
          style={{
            flex: 1,
            minHeight: 40,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: radius.pill,
            backgroundColor: option.selected ? colors.primary : 'transparent',
          }}
        >
          <Text
            numberOfLines={1}
            style={[
              typography.label,
              {
                color: option.selected ? colors.onPrimary : colors.textMuted,
                fontWeight: option.selected ? '700' : '500',
              },
            ]}
          >
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
