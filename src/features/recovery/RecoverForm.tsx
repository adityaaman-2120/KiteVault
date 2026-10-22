import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { wipe } from '@/crypto';
import { Button, EmptyState, ScreenContainer, StrengthMeter, TextField } from '@/components';
import { useForceScreenProtection } from '@/features/privacy/screenProtection';
import { clearAttemptState } from '@/features/lock/unlockService';
import { evaluatePassword } from '@/features/onboarding/passwordStrength';
import { MIN_PASSWORD_LENGTH, passwordLength } from '@/features/onboarding/validation';
import { recordPasswordUnlock } from '@/native/keystore';
import { useTheme } from '@/theme';
import {
  countRecoveryCharacters,
  getRecoveryInfo,
  parseRecoveryKey,
  RECOVERY_KEY_CHARACTERS,
  useVaultStore,
  VaultError,
} from '@/vault';

import { RECOVERY_WARNING } from './RecoveryKeyCreateScreen';
import { RecoveryKeyGuide } from './RecoveryKeyGuide';

type Check = 'empty' | 'incomplete' | 'typo' | 'ok';

// Live check of the typed key. It only inspects the text; nothing is unlocked.
export function checkRecoveryText(text: string): Check {
  const count = countRecoveryCharacters(text);
  if (count === 0) return 'empty';
  if (count < RECOVERY_KEY_CHARACTERS) return 'incomplete';
  try {
    wipe(parseRecoveryKey(text)); // only checking the text; the key bytes are not needed here
    return 'ok';
  } catch {
    return 'typo';
  }
}

function describeError(error: unknown): string {
  if (error instanceof VaultError) {
    switch (error.code) {
      case 'INVALID_RECOVERY_KEY':
        return 'The recovery key has a typing mistake. Check each group against your copy.';
      case 'WRONG_RECOVERY_KEY':
        return 'This recovery key does not open this vault. It may be an older key that you replaced.';
      case 'NO_RECOVERY_KEY':
        return 'This vault has no recovery key.';
      case 'CORRUPTED':
        return 'The vault file is damaged and cannot be opened.';
    }
  }
  return 'The vault could not be recovered, and nothing was changed. Please try again.';
}

export function RecoverForm() {
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const recover = useVaultStore((s) => s.recover);
  // The recovery key must never end up in a screenshot, even a deliberate one.
  useForceScreenProtection();

  const [hasRecovery, setHasRecovery] = useState<boolean | null>(null);
  const [recoveryText, setRecoveryText] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getRecoveryInfo().then(
      (info) => setHasRecovery(info?.exists === true),
      () => setHasRecovery(false),
    );
  }, []);

  const keyCheck = checkRecoveryText(recoveryText);
  const strength = useMemo(() => evaluatePassword(next), [next]);
  const passwordError =
    next.length > 0 && passwordLength(next) < MIN_PASSWORD_LENGTH
      ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
      : undefined;
  const confirmError =
    confirm.length > 0 && confirm !== next ? 'The passwords do not match.' : undefined;
  const ready =
    keyCheck === 'ok' && passwordLength(next) >= MIN_PASSWORD_LENGTH && confirm === next;

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await recover(recoveryText, next);
      // Getting back in counts as a fresh start for the unlock delay and biometric counters.
      clearAttemptState();
      recordPasswordUnlock();
      setRecoveryText('');
      setNext('');
      setConfirm('');
      Alert.alert(
        'Vault recovered',
        'Your new master password is set. Your recovery key still opens the vault; if you think anyone saw it, make a new one in Settings.',
      );
      router.replace('/vault');
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  }

  if (hasRecovery === false) {
    return (
      <ScreenContainer>
        <EmptyState
          title="No recovery key"
          message="This vault has no recovery key, so a forgotten master password cannot be recovered by anyone. If you cannot remember it, the only way to start again is to clear KiteVault's data in Android settings (or uninstall the app), which deletes this vault for good."
        />
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll>
      <View
        style={{
          borderWidth: 2,
          borderColor: colors.danger,
          borderRadius: 12,
          padding: spacing.lg,
          gap: spacing.xs,
        }}
      >
        <Text style={[typography.label, { color: colors.danger }]}>{RECOVERY_WARNING}</Text>
        <Text style={[typography.caption, { color: colors.text }]}>
          Only use your own recovery key, and keep it offline.
        </Text>
      </View>

      <RecoveryKeyGuide typed={countRecoveryCharacters(recoveryText)} />

      <TextField
        label="Recovery key"
        secret
        value={recoveryText}
        onChangeText={setRecoveryText}
        editable={!busy}
        autoCapitalize="characters"
        placeholder="8 groups of 7 characters"
        error={
          keyCheck === 'typo'
            ? 'There is a typing mistake somewhere. Compare each group with your copy.'
            : undefined
        }
      />
      <Text
        style={[
          typography.caption,
          { color: keyCheck === 'ok' ? colors.success : colors.textMuted },
        ]}
      >
        {keyCheck === 'ok'
          ? 'The recovery key looks right.'
          : `${countRecoveryCharacters(recoveryText)} of ${RECOVERY_KEY_CHARACTERS} characters. Spaces, hyphens and capitals do not matter.`}
      </Text>

      <TextField
        label="New master password"
        secret
        value={next}
        onChangeText={setNext}
        editable={!busy}
        textContentType="newPassword"
        error={passwordError}
      />
      {next.length > 0 ? (
        <StrengthMeter score={strength.score} label={strength.label} hint={strength.hint} />
      ) : null}
      <TextField
        label="Confirm new master password"
        secret
        value={confirm}
        onChangeText={setConfirm}
        editable={!busy}
        textContentType="newPassword"
        error={confirmError}
      />

      {error ? (
        <Text accessibilityRole="alert" style={[typography.body, { color: colors.danger }]}>
          {error}
        </Text>
      ) : null}
      <Button
        title={busy ? 'Recovering…' : 'Recover vault'}
        onPress={() => void submit()}
        disabled={!ready}
        loading={busy}
      />
    </ScreenContainer>
  );
}
