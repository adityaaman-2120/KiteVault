import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { wipe } from '@/crypto';
import { Button, Card, ScreenContainer, TextField } from '@/components';
import { createUniformPicker } from '@/features/generator/uniform';
import { formatWait } from '@/features/lock/UnlockForm';
import { LockoutError, runWithAttemptLimit } from '@/features/lock/unlockService';
import { useForceScreenProtection } from '@/features/privacy/screenProtection';
import { useTheme } from '@/theme';
import {
  formatRecoveryKey,
  generateRecoveryKey,
  getRecoveryInfo,
  normalizeRecoveryText,
  setRecoveryKey,
  verifyMasterPassword,
  VaultError,
} from '@/vault';

import { PDF_WARNING, printRecoveryKey } from './recoveryPdf';

export const RECOVERY_WARNING = 'Anyone with the recovery key can open your vault.';

function describeError(error: unknown): string {
  if (error instanceof LockoutError) {
    return `Too many wrong attempts. Try again in ${formatWait(error.remainingMs)}.`;
  }
  if (error instanceof VaultError && error.code === 'WRONG_PASSWORD') {
    return 'The master password is wrong.';
  }
  if (error instanceof VaultError && error.code === 'LOCKED') {
    return 'The vault is locked. Unlock it and try again.';
  }
  return 'The recovery key could not be saved, and nothing was changed. Please try again.';
}

export function RecoveryKeyCreateScreen() {
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  // Whatever happens on this screen, it can never be captured by a screenshot or recording.
  useForceScreenProtection();

  const [hasExisting, setHasExisting] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The key lives in memory only while this screen is open. Nothing is stored until Finish.
  const keyBytes = useRef<Uint8Array | null>(null);
  const [keyText, setKeyText] = useState<string | null>(null);
  const [checkIndex] = useState(() => createUniformPicker().pick(8));
  const [typedGroup, setTypedGroup] = useState('');
  const [createdAt] = useState(() => Date.now());

  useEffect(() => {
    void getRecoveryInfo().then((info) => setHasExisting(info?.exists === true));
    return () => {
      wipe(keyBytes.current);
      keyBytes.current = null;
    };
  }, []);

  async function reveal() {
    if (busy || password.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await runWithAttemptLimit(() => verifyMasterPassword(password));
      setPassword('');
      const bytes = generateRecoveryKey();
      keyBytes.current = bytes;
      setKeyText(formatRecoveryKey(bytes));
    } catch (e) {
      setError(describeError(e));
    }
    setBusy(false);
  }

  async function finish() {
    const bytes = keyBytes.current;
    if (!bytes || busy) return;
    setBusy(true);
    setError(null);
    try {
      await setRecoveryKey(bytes);
      wipe(bytes);
      keyBytes.current = null;
      setKeyText(null);
      Alert.alert(
        'Recovery key saved',
        'Keep your written copy somewhere safe and offline. Anyone with it can open your vault.',
      );
      router.back();
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  }

  function offerPdf() {
    if (!keyText) return;
    Alert.alert('Print or save as PDF?', PDF_WARNING, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        onPress: () => {
          printRecoveryKey(keyText, createdAt).catch(() =>
            Alert.alert('Could not open the print screen', 'Write the key down by hand instead.'),
          );
        },
      },
    ]);
  }

  const warning = (
    <View
      style={{
        borderWidth: 2,
        borderColor: colors.danger,
        borderRadius: 12,
        padding: spacing.lg,
        gap: spacing.sm,
      }}
    >
      <Text style={[typography.heading, { color: colors.danger }]}>{RECOVERY_WARNING}</Text>
      <Text style={[typography.body, { color: colors.text }]}>
        It works instead of your master password. Write it on paper and keep it offline, for example
        in a safe. Never store it as a screenshot, a photo, a note on this phone, or in the cloud.
      </Text>
    </View>
  );

  if (keyText === null) {
    return (
      <ScreenContainer scroll>
        {warning}
        <Text style={[typography.body, { color: colors.textMuted }]}>
          If you forget your master password, the recovery key is the only way back in. Without one,
          your data cannot be recovered by anyone.
        </Text>
        {hasExisting ? (
          <Text style={[typography.body, { color: colors.warning }]}>
            You already have a recovery key. Making a new one replaces it: the old key stops
            working.
          </Text>
        ) : null}
        <TextField
          label="Master password"
          secret
          value={password}
          onChangeText={setPassword}
          editable={!busy}
          onSubmitEditing={() => void reveal()}
        />
        {error ? (
          <Text accessibilityRole="alert" style={[typography.body, { color: colors.danger }]}>
            {error}
          </Text>
        ) : null}
        <Button
          title="Show my recovery key"
          onPress={() => void reveal()}
          disabled={password.length === 0}
          loading={busy}
        />
      </ScreenContainer>
    );
  }

  const typedOk =
    normalizeRecoveryText(typedGroup) === normalizeRecoveryText(keyText.split('-')[checkIndex]!);

  return (
    <ScreenContainer scroll>
      {warning}
      <Card>
        <Text style={[typography.label, { color: colors.textMuted }]}>Your recovery key</Text>
        {keyText.split('-').map((group, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: spacing.lg, alignItems: 'center' }}>
            <Text style={[typography.body, { color: colors.textMuted, width: 20 }]}>{i + 1}</Text>
            <Text
              accessibilityLabel={`Group ${i + 1}: ${group.split('').join(' ')}`}
              style={[
                typography.title,
                { color: colors.text, fontFamily: 'monospace', letterSpacing: 3 },
              ]}
            >
              {group}
            </Text>
          </View>
        ))}
      </Card>
      <Text style={[typography.body, { color: colors.textMuted }]}>
        Write all 8 groups on paper, exactly as shown. Screenshots are blocked on this screen. The
        letters I, L, O and U are never used.
      </Text>

      <Button title="Print or save as PDF" variant="secondary" onPress={offerPdf} />

      <TextField
        label={`Check your copy: type group ${checkIndex + 1}`}
        value={typedGroup}
        onChangeText={setTypedGroup}
        autoCapitalize="characters"
        editable={!busy}
        error={
          typedGroup.length >= 7 && !typedOk
            ? 'That does not match group ' + (checkIndex + 1) + '.'
            : undefined
        }
      />
      {error ? (
        <Text accessibilityRole="alert" style={[typography.body, { color: colors.danger }]}>
          {error}
        </Text>
      ) : null}
      <Button
        title={busy ? 'Saving…' : 'I have written it down. Finish'}
        onPress={() => void finish()}
        disabled={!typedOk}
        loading={busy}
      />
      <Text style={[typography.caption, { color: colors.textMuted }]}>
        The recovery key is saved only when you press Finish. Leaving this screen now discards it.
      </Text>
    </ScreenContainer>
  );
}
