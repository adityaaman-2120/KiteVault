import { Pressable, Text } from 'react-native';

import { useTheme } from '@/theme';
import { useVaultStore } from '@/vault';

// Header button that locks the vault immediately.
export function LockButton() {
  const { colors, spacing, typography } = useTheme();
  const lock = useVaultStore((s) => s.lock);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Lock now"
      onPress={lock}
      hitSlop={8}
      style={{ paddingHorizontal: spacing.lg }}
    >
      <Text style={[typography.label, { color: colors.primary }]}>Lock now</Text>
    </Pressable>
  );
}
