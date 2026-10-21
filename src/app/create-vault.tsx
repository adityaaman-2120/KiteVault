import { Button, ScreenContainer, TextField } from '@/components';
import { useSessionStore } from '@/features/session/useSessionStore';

export default function CreateVaultScreen() {
  const setStatus = useSessionStore((s) => s.setStatus);

  return (
    <ScreenContainer>
      <TextField label="Master password" secret />
      <TextField label="Confirm master password" secret />
      {/* Placeholder: no vault is created yet. */}
      <Button title="Create vault" onPress={() => setStatus('unlocked')} />
    </ScreenContainer>
  );
}
