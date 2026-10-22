import { useState } from 'react';
import { Modal, Text, View } from 'react-native';

import { wipe } from '@/crypto';
import { Button, Card, TextField } from '@/components';
import { useBiometricState } from '@/features/biometric/useBiometricState';
import { LockoutError, runWithAttemptLimit } from '@/features/lock/unlockService';
import { unlockWithBiometrics } from '@/native/keystore';
import { useTheme } from '@/theme';
import { VaultError, verifyMasterPassword } from '@/vault';

import { eraseEverything, ERASE_WORD, isEraseConfirmed } from './eraseVault';

export const ERASE_WARNING =
  'This will permanently erase all passwords on this device. This cannot be undone. A backup in your Google Drive, if you have one, is not deleted.';

type Props = {
  // Ask for the master password (or fingerprint / face) before the erase confirmation. Turn this
  // on while the vault is unlocked. It stays off on the Unlock screen, where the person may have
  // forgotten the password and erasing is the way out.
  requireAuth?: boolean;
  title?: string;
  description?: string;
  warning?: string;
};

// The messages never include the password or the underlying error.
function describeVerifyError(error: unknown): string {
  if (error instanceof LockoutError) {
    return `Too many wrong passwords. Please wait ${Math.ceil(error.remainingMs / 1000)} seconds and try again.`;
  }
  if (error instanceof VaultError && error.code === 'WRONG_PASSWORD') {
    return 'Wrong password. Please try again.';
  }
  return 'Could not check the password. Please try again.';
}

export function EraseVaultCard({
  requireAuth = false,
  title = 'Erase vault',
  description = 'Deletes every password, note and setting from this phone.',
  warning = ERASE_WARNING,
}: Props) {
  const { colors, radius, spacing, typography } = useTheme();
  const [open, setOpen] = useState(false);
  // 'verify' is the "confirm it's you" step; 'confirm' is typing ERASE.
  const [step, setStep] = useState<'verify' | 'confirm'>('confirm');
  const [password, setPassword] = useState('');
  const biometric = useBiometricState();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (busy) return;
    setOpen(false);
    setTyped('');
    setPassword('');
    setError(null);
  }

  function start() {
    setStep(requireAuth ? 'verify' : 'confirm');
    setOpen(true);
  }

  // The master password is only checked, never kept: it is cleared as soon as the check ends.
  async function verifyWithPassword() {
    if (busy || password.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await runWithAttemptLimit(() => verifyMasterPassword(password));
      setStep('confirm');
    } catch (e) {
      setError(describeVerifyError(e));
    }
    setPassword('');
    setBusy(false);
  }

  // Passing the phone's own fingerprint / face prompt counts as proof. The key the prompt hands
  // back is not needed here, so it is wiped straight away.
  async function verifyWithBiometric() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      wipe(await unlockWithBiometrics());
      setStep('confirm');
    } catch {
      setError('Fingerprint or face was not confirmed. Use your master password instead.');
    }
    setBusy(false);
  }

  async function erase() {
    if (!isEraseConfirmed(typed) || busy) return;
    setBusy(true);
    setError(null);
    try {
      await eraseEverything();
      // The app moves to the welcome screen by itself.
    } catch {
      setError('The vault could not be erased, and nothing was changed. Please try again.');
      setBusy(false);
    }
  }

  return (
    <>
      <Card>
        <Text style={[typography.heading, { color: colors.danger }]}>{title}</Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>{description}</Text>
        <Button title={title} variant="danger" onPress={start} />
      </Card>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            padding: spacing.xl,
            backgroundColor: 'rgba(0,0,0,0.6)',
          }}
        >
          <View
            accessibilityViewIsModal
            style={{
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              padding: spacing.xl,
              gap: spacing.lg,
              borderWidth: 2,
              borderColor: colors.danger,
            }}
          >
            {step === 'verify' ? (
              <>
                <Text style={[typography.heading, { color: colors.text }]}>
                  Confirm it&apos;s you
                </Text>
                <Text style={[typography.body, { color: colors.textMuted }]}>
                  Enter your master password before erasing the vault.
                </Text>
                <TextField
                  label="Master password"
                  secret
                  value={password}
                  onChangeText={setPassword}
                  editable={!busy}
                  onSubmitEditing={() => void verifyWithPassword()}
                />
                {error ? (
                  <Text
                    accessibilityRole="alert"
                    style={[typography.body, { color: colors.danger }]}
                  >
                    {error}
                  </Text>
                ) : null}
                <Button
                  title="Continue"
                  onPress={() => void verifyWithPassword()}
                  disabled={password.length === 0}
                  loading={busy}
                />
                {biometric.state === 'ready' ? (
                  <Button
                    title="Use fingerprint or face"
                    variant="secondary"
                    onPress={() => void verifyWithBiometric()}
                    disabled={busy}
                  />
                ) : null}
                <Button title="Cancel" variant="secondary" onPress={close} disabled={busy} />
              </>
            ) : (
              <>
                <Text style={[typography.heading, { color: colors.danger }]}>Erase vault?</Text>
                <Text style={[typography.body, { color: colors.text }]}>{warning}</Text>
                <TextField
                  label={`Type ${ERASE_WORD} to confirm`}
                  value={typed}
                  onChangeText={setTyped}
                  editable={!busy}
                  autoCapitalize="characters"
                  placeholder={ERASE_WORD}
                />
                {error ? (
                  <Text
                    accessibilityRole="alert"
                    style={[typography.body, { color: colors.danger }]}
                  >
                    {error}
                  </Text>
                ) : null}
                <Button
                  title={busy ? 'Erasing…' : 'Erase everything'}
                  variant="danger"
                  onPress={() => void erase()}
                  disabled={!isEraseConfirmed(typed)}
                  loading={busy}
                />
                <Button title="Cancel" variant="secondary" onPress={close} disabled={busy} />
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}
