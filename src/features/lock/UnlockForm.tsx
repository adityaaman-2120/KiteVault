import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { Button, ScreenContainer, TextField } from '@/components';
import { useTheme } from '@/theme';
import { VaultError } from '@/vault';

import { remainingLockoutMs } from './attemptPolicy';
import { loadAttemptState, LockoutError, unlockWithAttemptLimit } from './unlockService';

export function formatWait(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

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
  // Time left on the current delay, refreshed once a second while it runs.
  const [remainingMs, setRemainingMs] = useState(0);
  const lockedUntil = useRef(0);

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

  const waiting = remainingMs > 0;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(
      () => setRemainingMs(Math.max(0, lockedUntil.current - Date.now())),
      1000,
    );
    return () => clearInterval(timer);
  }, [waiting]);

  async function submit() {
    if (busy || waiting || password.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await unlockWithAttemptLimit(password);
      setPassword('');
      router.replace('/vault');
    } catch (e) {
      setPassword('');
      if (e instanceof LockoutError) {
        startWait(e.remainingMs);
      } else {
        setError(describeError(e));
        // A wrong guess may have started a delay; read it back.
        const remaining = remainingLockoutMs(await loadAttemptState(), Date.now());
        if (remaining > 0) startWait(remaining);
      }
      setBusy(false);
    }
  }

  return (
    <ScreenContainer scroll>
      <View style={{ gap: spacing.sm, marginTop: spacing.xxl }}>
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

      {error ? (
        <Text accessibilityRole="alert" style={[typography.body, { color: colors.danger }]}>
          {error}
        </Text>
      ) : null}
      {waiting ? (
        <Text accessibilityRole="alert" style={[typography.body, { color: colors.warning }]}>
          Too many wrong attempts. Try again in {formatWait(remainingMs)}.
        </Text>
      ) : null}

      <Button
        title={busy ? 'Unlocking…' : 'Unlock'}
        onPress={submit}
        disabled={password.length === 0 || waiting}
        loading={busy}
      />
    </ScreenContainer>
  );
}
