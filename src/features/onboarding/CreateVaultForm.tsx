import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text } from 'react-native';

import { Button, Checkbox, ScreenContainer, StrengthMeter, TextField } from '@/components';
import { LegalLinks } from '@/features/about/LegalLinks';
import { useBiometricOfferStore } from '@/features/biometric/biometricOfferStore';
import { useTheme } from '@/theme';
import { useVaultStore, VaultError } from '@/vault';

import { evaluatePassword } from './passwordStrength';
import { MIN_PASSWORD_LENGTH, passwordLength, validateCreateVault } from './validation';

const WARNING =
  'I understand that if I forget my master password, nobody can recover my data, not even Kitelux.';

// Never includes the underlying error: it could mention internals, and logs must stay secret-free.
function describeError(error: unknown): string {
  if (error instanceof VaultError && error.code === 'VAULT_EXISTS') {
    return 'A vault already exists on this device.';
  }
  return 'Your vault could not be created, and nothing was saved. Please try again.';
}

export function CreateVaultForm() {
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const createVault = useVaultStore((s) => s.create);
  const initialize = useVaultStore((s) => s.initialize);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { valid, errors } = validateCreateVault({ password, confirm, acknowledged });
  const strength = useMemo(() => evaluatePassword(password), [password]);
  const length = passwordLength(password);

  async function submit() {
    if (busy) return;
    // The button stays tappable so an invalid form can explain itself instead of looking broken.
    if (!valid) {
      setSubmitted(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createVault(password);
      // The home screen offers biometric unlock right away, while it is easiest to say yes.
      useBiometricOfferStore.getState().request();
      router.replace('/vault');
    } catch (e) {
      setError(describeError(e));
      // If the failure was "already exists", move the app to the unlock flow.
      if (e instanceof VaultError && e.code === 'VAULT_EXISTS') await initialize().catch(() => {});
      setBusy(false);
    }
  }

  return (
    <ScreenContainer scroll>
      <Text style={[typography.body, { color: colors.textMuted }]}>
        Choose a master password. It protects everything in your vault. Pick something long that you
        will remember: there is no way to reset it.
      </Text>

      <TextField
        label="Master password"
        secret
        value={password}
        onChangeText={setPassword}
        editable={!busy}
        textContentType="newPassword"
        error={
          submitted && errors.password
            ? `${errors.password} (${length}/${MIN_PASSWORD_LENGTH})`
            : undefined
        }
      />
      {password.length > 0 ? (
        <>
          <StrengthMeter score={strength.score} label={strength.label} hint={strength.hint} />
          {errors.password && !submitted ? (
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              {errors.password} ({length}/{MIN_PASSWORD_LENGTH})
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          At least {MIN_PASSWORD_LENGTH} characters. A few random words make a strong password.
        </Text>
      )}

      <TextField
        label="Confirm master password"
        secret
        value={confirm}
        onChangeText={setConfirm}
        editable={!busy}
        textContentType="newPassword"
        error={(confirm.length > 0 || submitted) && errors.confirm ? errors.confirm : undefined}
      />

      <Checkbox label={WARNING} checked={acknowledged} onChange={setAcknowledged} disabled={busy} />
      {submitted && errors.acknowledged ? (
        <Text accessibilityRole="alert" style={[typography.caption, { color: colors.danger }]}>
          {errors.acknowledged}
        </Text>
      ) : null}

      {error ? (
        <Text accessibilityRole="alert" style={[typography.body, { color: colors.danger }]}>
          {error}
        </Text>
      ) : null}

      <Button
        title={busy ? 'Creating vault…' : 'Create vault'}
        onPress={submit}
        disabled={busy}
        loading={busy}
      />
      <LegalLinks />
      {busy ? (
        <Text style={[typography.caption, { color: colors.textMuted, marginTop: -spacing.sm }]}>
          Securing your vault. This can take a few seconds.
        </Text>
      ) : null}
    </ScreenContainer>
  );
}
