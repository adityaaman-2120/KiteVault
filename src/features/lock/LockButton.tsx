import { TextAction } from '@/components';
import { useVaultStore } from '@/vault';

// Header button that locks the vault immediately.
export function LockButton() {
  const lock = useVaultStore((s) => s.lock);
  return <TextAction label="Lock now" onPress={lock} />;
}
