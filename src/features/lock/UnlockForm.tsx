import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';

import { BrandHeader, Button, ScreenContainer, TextAction, TextField } from '@/components';
import { unlockWithBiometric } from '@/features/biometric/biometricService';
import { describeBiometricError, describeReauth } from '@/features/biometric/messages';
import { offerBiometricUnlock } from '@/features/biometric/offerBiometricUnlock';
import { EraseVaultCard } from '@/features/data/EraseVaultCard';
import { useBiometricState } from '@/features/biometric/useBiometricState';
import { BiometricError, disableBiometricUnlock } from '@/native/keystore';
import { useTheme } from '@/theme';
import { VaultError } from '@/vault';

import { remainingLockoutMs } from './attemptPolicy';
import { loadAttemptState, LockoutError, unlockWithAttemptLimit } from './unlockService';

export function formatWait(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// Shown when the vault file cannot be read at all. Erasing it leads to the welcome screen, which
// offers "Restore from Google Drive".
export const DAMAGED_VAULT_HELP =
  'KiteVault cannot read the vault file on this phone. If you turned on Google Drive backup, erase the damaged file and then restore your latest backup with your master password. If you have no backup, the passwords in this file cannot be recovered.';

// Messages never include the password or the underlying error.
function describeError(error: unknown): string {
  if (error instanceof VaultError) {
    if (error.code === 'WRONG_PASSWORD') return 'Wrong password. Please try again.';
    if (error.code === 'CORRUPTED') return 'The vault file is damaged and cannot be opened.';
    if (error.code === 'UNSUPPORTED_VERSION')
      return 'This vault needs a newer version of KiteVault.';
  }
  return 'Could not unlock the vault. Please try again.';
}

export function UnlockForm() {
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [damaged, setDamaged] = useState(false);
  // Time left on the current delay, refreshed once a second while it runs.
  const [remainingMs, setRemainingMs] = useState(0);
  const lockedUntil = useRef(0);
  const biometric = useBiometricState();
  const [biometricBusy, setBiometricBusy] = useState(false);

  function startWait(ms: number) {
    lockedUntil.current = Date.now() + ms;
    setRemainingMs(ms);
  }

  // Pick up a delay that was already running when the app was reopened.
  useEffect(() => {
    let cancelled = false;
    void loadAttemptState().then((state) => {
      const remaining = remainingLockoutMs(state, Date.now());
      if (!cancelled && remaining > 0) startWait(remaining);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // If the phone's biometrics changed or were removed, the stored key is dead: remove it and say why.
  const { state: biometricState, refresh: refreshBiometric } = biometric;
  const [staleKeyNotice, setStaleKeyNotice] = useState<string | null>(null);
  useEffect(() => {
    if (biometricState !== 'invalidated' && biometricState !== 'unavailable') return;
    const kind = biometricState === 'invalidated' ? 'key-invalidated' : 'unavailable';
    disableBiometricUnlock();
    void refreshBiometric().then(() =>
      setStaleKeyNotice(describeBiometricError(new BiometricError(kind))),
    );
  }, [biometricState, refreshBiometric]);

  const waiting = remainingMs > 0;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(
      () => setRemainingMs(Math.max(0, lockedUntil.current - Date.now())),
      1000,
    );
    return () => clearInterval(timer);
  }, [waiting]);

  // Once biometric unlock is set up it is the default way in: the fingerprint prompt opens by
  // itself. It is tried once per visit to this screen, so cancelling it does not make it come
  // back. It waits until the app is in front, because the system prompt cannot show otherwise.
  const autoTried = useRef(false);
  const autoBiometric = useRef(submitBiometric);
  useEffect(() => {
    autoBiometric.current = submitBiometric;
  });
  useEffect(() => {
    if (biometricState !== 'ready' || autoTried.current) return;
    const run = () => {
      if (autoTried.current) return;
      autoTried.current = true;
      void autoBiometric.current(true);
    };
    if (AppState.currentState === 'active') {
      run();
      return;
    }
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => subscription.remove();
  }, [biometricState]);

  async function submit() {
    if (busy || waiting || password.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await unlockWithAttemptLimit(password);
      setPassword('');
      void offerBiometricUnlock(); // asks only if it is available and not on yet
      router.replace('/vault');
    } catch (e) {
      setPassword('');
      if (e instanceof LockoutError) {
        startWait(e.remainingMs);
      } else {
        setError(describeError(e));
        setDamaged(e instanceof VaultError && e.code === 'CORRUPTED');
        // A wrong guess may have started a delay; read it back.
        const remaining = remainingLockoutMs(await loadAttemptState(), Date.now());
        if (remaining > 0) startWait(remaining);
      }
      setBusy(false);
    }
  }

  // `automatic` is the prompt that opens by itself. Dismissing that one is normal, so it says
  // nothing; the password field and the fingerprint button are right there.
  async function submitBiometric(automatic = false) {
    if (busy || biometricBusy) return;
    setBiometricBusy(true);
    setError(null);
    try {
      await unlockWithBiometric();
      router.replace('/vault');
    } catch (e) {
      if (!(automatic && e instanceof BiometricError && e.kind === 'cancelled')) {
        setError(describeBiometricError(e));
      }
      // The key may have been removed (changed biometrics, 5 unlocks, ...): refresh what we show.
      await refreshBiometric();
      setBiometricBusy(false);
    }
  }

  return (
    <ScreenContainer scroll headerless>
      <View style={{ gap: spacing.sm, marginTop: spacing.xl }}>
        <BrandHeader />
        <Text style={[typography.title, { color: colors.text }]}>Unlock</Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>
          Enter your master password to open your vault.
        </Text>
      </View>

      <TextField
        label="Master password"
        secret
        value={password}
        onChangeText={setPassword}
        editable={!busy}
        onSubmitEditing={submit}
      />

      {(error ?? staleKeyNotice) ? (
        <Text accessibilityRole="alert" style={[typography.body, { color: colors.danger }]}>
          {error ?? staleKeyNotice}
        </Text>
      ) : null}
      {waiting ? (
        <Text accessibilityRole="alert" style={[typography.body, { color: colors.warning }]}>
          Too many wrong attempts. Try again in {formatWait(remainingMs)}.
        </Text>
      ) : null}

      {damaged ? (
        <EraseVaultCard
          title="Erase damaged vault"
          description={DAMAGED_VAULT_HELP}
          warning="This deletes the damaged vault file from this phone. Your passwords cannot be recovered from it afterwards. This cannot be undone."
        />
      ) : null}

      <Button
        title={busy ? 'Unlocking…' : 'Unlock'}
        onPress={submit}
        disabled={password.length === 0 || waiting}
        loading={busy}
      />

      {biometric.state === 'ready' ? (
        <Button
          title={biometricBusy ? 'Waiting for fingerprint…' : 'Unlock with fingerprint'}
          variant="secondary"
          onPress={() => void submitBiometric()}
          disabled={busy}
          loading={biometricBusy}
        />
      ) : null}
      {biometric.state === 'reauth-required' ? (
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          {describeReauth()} Biometric unlock will work again afterwards.
        </Text>
      ) : null}

      <TextAction
        label="Forgot master password?"
        onPress={() => router.push('/recover')}
        disabled={busy}
      />
    </ScreenContainer>
  );
}
