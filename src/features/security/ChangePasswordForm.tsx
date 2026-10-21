import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Text } from 'react-native';

import { Button, ScreenContainer, StrengthMeter, TextField } from '@/components';
import { LockoutError, runWithAttemptLimit } from '@/features/lock/unlockService';
import { evaluatePassword } from '@/features/onboarding/passwordStrength';
import { MIN_PASSWORD_LENGTH, passwordLength } from '@/features/onboarding/validation';
import { useTheme } from '@/theme';
import { useVaultStore, VaultError } from '@/vault';

import { formatWait } from '@/features/lock/UnlockForm';

export type ChangePasswordInput = { current: string; next: string; confirm: string };
export type ChangePasswordErrors = { current?: string; next?: string; confirm?: string };

// Pure rules for the form. Messages never repeat a password.
export function validateChangePassword({ current, next, confirm }: ChangePasswordInput): {
  valid: boolean;
  errors: ChangePasswordErrors;
} {
  const errors: ChangePasswordErrors = {};
  if (current.length === 0) errors.current = 'Enter your current master password.';
  if (passwordLength(next) < MIN_PASSWORD_LENGTH) {
    errors.next = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  } else if (next === current) {
    errors.next = 'Choose a password that is different from the current one.';
  }
  if (confirm !== next) errors.confirm = 'The new passwords do not match.';
  return { valid: Object.keys(errors).length === 0, errors };
}

// Never includes the underlying error: it could carry internals.
function describeError(error: unknown): string {
  if (error instanceof LockoutError) {
    return `Too many wrong attempts. Try again in ${formatWait(error.remainingMs)}.`;
  }
  if (error instanceof VaultError) {
    if (error.code === 'WRONG_PASSWORD') return 'The current password is wrong.';
    if (error.code === 'LOCKED') return 'The vault is locked. Unlock it and try again.';
  }
  return 'Your password could not be changed, and nothing was changed. Please try again.';
}

export function ChangePasswordForm() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const changePassword = useVaultStore((s) => s.changePassword);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { valid, errors } = validateChangePassword({ current, next, confirm });
  const strength = useMemo(() => evaluatePassword(next), [next]);

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await runWithAttemptLimit(() => changePassword(current, next));
      setCurrent('');
      setNext('');
      setConfirm('');
      Alert.alert(
        'Master password changed',
        'Use your new master password the next time you unlock.',
      );
      router.back();
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  }

  return (
    <ScreenContainer scroll>
      <Text style={[typography.body, { color: colors.textMuted }]}>
        Your passwords are not re-encrypted: only the key that protects them is wrapped again with
        the new password. If you forget the new password, your data cannot be recovered.
      </Text>

      <TextField
        label="Current master password"
        secret
        value={current}
        onChangeText={setCurrent}
        editable={!busy}
      />

      <TextField
        label="New master password"
        secret
        value={next}
        onChangeText={setNext}
        editable={!busy}
        textContentType="newPassword"
        error={next.length > 0 ? errors.next : undefined}
      />
      {next.length > 0 ? (
        <StrengthMeter score={strength.score} label={strength.label} hint={strength.hint} />
      ) : (
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          At least {MIN_PASSWORD_LENGTH} characters. A few random words make a strong password.
        </Text>
      )}

      <TextField
        label="Confirm new master password"
        secret
        value={confirm}
        onChangeText={setConfirm}
        editable={!busy}
        textContentType="newPassword"
        error={confirm.length > 0 ? errors.confirm : undefined}
      />

      {error ? (
        <Text accessibilityRole="alert" style={[typography.body, { color: colors.danger }]}>
          {error}
        </Text>
      ) : null}

      <Button
        title={busy ? 'Changing…' : 'Change master password'}
        onPress={() => void submit()}
        disabled={!valid}
        loading={busy}
      />
      {busy ? (
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          Securing your vault. This can take a few seconds.
        </Text>
      ) : null}
    </ScreenContainer>
  );
}
