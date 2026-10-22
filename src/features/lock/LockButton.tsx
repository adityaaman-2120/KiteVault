import { Pressable } from 'react-native';

import { TabIcon } from '@/components';
import { touch } from '@/theme';
import { useVaultStore } from '@/vault';

// Mint green, to match the amber Folders and red Trash buttons next to it. Light enough to read on
// the dark header in both themes.
const MINT = '#6FD3A5';

// Header button that locks the vault immediately: a round padlock, no text.
export function LockButton() {
  const lock = useVaultStore((s) => s.lock);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Lock now"
      hitSlop={(touch.min - 40) / 2}
      onPress={lock}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? 'rgba(111,211,165,0.36)' : 'rgba(111,211,165,0.2)',
      })}
    >
      <TabIcon name="vault" color={MINT} size={20} />
    </Pressable>
  );
}
