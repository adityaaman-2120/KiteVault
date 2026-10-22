import { Pressable, Text } from 'react-native';

import { touch, useTheme } from '@/theme';

type Props = {
  label: string;
  onPress: () => void;
  // The accessible name when it should say more than the visible word ("Copy Password").
  accessibilityLabel?: string;
  color?: string;
  disabled?: boolean;
};

// A word you can tap ("Show", "Copy", "Open"). The word is small but the area that reacts to a
// touch is at least 48 x 48, which is what Android asks for, so it is easy to hit.
export function TextAction({ label, onPress, accessibilityLabel, color, disabled = false }: Props) {
  const { colors, typography } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: touch.min,
        minWidth: touch.min,
        paddingHorizontal: 6,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={[typography.label, { color: color ?? colors.primary }]}>{label}</Text>
    </Pressable>
  );
}
