import { Pressable, View } from 'react-native';

import { touch, useTheme } from '@/theme';

type Props = {
  // True while the secret is on show: the eye is crossed out, meaning "tap to hide".
  revealed: boolean;
  onPress: () => void;
  // Says what the button does and for which field, for example "Show Password".
  accessibilityLabel: string;
};

// The show / hide button for a secret. The eye is drawn with plain views, like the tab icons.
// The touch area is 48 x 48 even though the eye is small.
export function EyeButton({ revealed, onPress, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const color = colors.textMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: revealed }}
      onPress={onPress}
      style={{
        minHeight: touch.min,
        minWidth: touch.min,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
        {/* The outline of the eye. */}
        <View
          style={{
            width: 24,
            height: 15,
            borderRadius: 8,
            borderWidth: 2,
            borderColor: color,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* The pupil. */}
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
        </View>
        {revealed ? (
          // The slash across the eye.
          <View
            style={{
              position: 'absolute',
              width: 28,
              height: 2.5,
              borderRadius: 2,
              backgroundColor: color,
              transform: [{ rotate: '-45deg' }],
            }}
          />
        ) : null}
      </View>
    </Pressable>
  );
}
