import { Pressable } from 'react-native';

import { TabIcon } from '@/components';
import { touch, useTheme } from '@/theme';
import { useVaultStore } from '@/vault';

// Header button that locks the vault immediately: a round padlock, no text.
export function LockButton() {
  const lock = useVaultStore((s) => s.lock);
  const { colors, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Lock now"
      hitSlop={(touch.min - 40) / 2}
      onPress={lock}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        marginRight: spacing.md,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        // A faint white wash reads on the dark header in both themes.
        backgroundColor: pressed ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.16)',
      })}
    >
      <TabIcon name="vault" color={colors.onHeader} size={20} />
    </Pressable>
  );
}
