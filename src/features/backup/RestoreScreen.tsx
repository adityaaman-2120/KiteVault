import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { Button, Card, ScreenContainer, TextField } from '@/components';
import { formatDate } from '@/features/entries/format';
import { formatWait } from '@/features/lock/UnlockForm';
import { LockoutError, runWithAttemptLimit } from '@/features/lock/unlockService';
import { useTheme } from '@/theme';
import { useVaultStore, VaultError } from '@/vault';

import {
  downloadCloudBackup,
  findCloudBackup,
  rememberRestoredBackup,
  signOutOfBackup,
} from './backupService';
import { isCloudBackupAvailable } from './config';
import type { RemoteBackup } from './driveApi';
import { BackupError, describeBackupError } from './errors';

export const RESTORE_NOTICE =
  'Signing in with Google only finds your encrypted backup. It cannot open your vault. You need your master password to decrypt it.';

export function describeError(error: unknown): string {
  if (error instanceof LockoutError) {
    return `Too many wrong attempts. Try again in ${formatWait(error.remainingMs)}.`;
  }
  if (error instanceof VaultError) {
    if (error.code === 'WRONG_PASSWORD') {
      return 'That master password does not open this backup. Use the master password the vault had when it was backed up.';
    }
    if (error.code === 'VAULT_EXISTS') return 'This phone already has a vault.';
    if (error.code === 'CORRUPTED' || error.code === 'UNSUPPORTED_VERSION') {
      return describeBackupError(new BackupError('invalid-backup'));
    }
  }
  return describeBackupError(error);
}

export function RestoreScreen() {
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const restore = useVaultStore((s) => s.restore);

  const [email, setEmail] = useState<string | null>(null);
  const [backup, setBackup] = useState<RemoteBackup | null>(null);
  const [searched, setSearched] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'idle' | 'finding' | 'restoring'>('idle');
  const [error, setError] = useState<string | null>(null);
  // Downloaded once and kept (encrypted) so a mistyped password does not download it again.
  const downloaded = useRef<Uint8Array | null>(null);

  useEffect(
    () => () => {
      downloaded.current = null;
    },
    [],
  );

  async function signInAndFind() {
    setBusy('finding');
    setError(null);
    try {
      const found = await findCloudBackup();
      setEmail(found.email);
      setBackup(found.backup);
      setSearched(true);
      downloaded.current = null;
    } catch (e) {
      if (!(e instanceof BackupError && e.kind === 'cancelled')) setError(describeError(e));
    }
    setBusy('idle');
  }

  async function switchAccount() {
    await signOutOfBackup();
    setEmail(null);
    setBackup(null);
    setSearched(false);
    setPassword('');
    setError(null);
    downloaded.current = null;
  }

  async function submit() {
    if (!backup || password.length === 0 || busy !== 'idle') return;
    setBusy('restoring');
    setError(null);
    try {
      if (!downloaded.current) downloaded.current = await downloadCloudBackup(backup);
      const bytes = downloaded.current;
      await runWithAttemptLimit(() => restore(bytes, password));
      await rememberRestoredBackup(backup, email ?? '');
      setPassword('');
      downloaded.current = null;
      router.replace('/vault');
    } catch (e) {
      setError(describeError(e));
      setPassword('');
      setBusy('idle');
    }
  }

  if (!isCloudBackupAvailable()) {
    return (
      <ScreenContainer>
        <Text style={[typography.body, { color: colors.textMuted }]}>
          Restoring from Google Drive is not available in this version of the app.
        </Text>
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll>
      <Card>
        <Text style={[typography.heading, { color: colors.text }]}>Restore from Google Drive</Text>
        <Text style={[typography.body, { color: colors.text }]}>{RESTORE_NOTICE}</Text>
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          Only the backup that KiteVault made in its own hidden Google Drive folder is used.
        </Text>
      </Card>

      {!searched ? (
        <Button
          title={busy === 'finding' ? 'Looking for your backup…' : 'Sign in with Google'}
          onPress={() => void signInAndFind()}
          loading={busy === 'finding'}
        />
      ) : null}

      {searched && !backup ? (
        <View style={{ gap: spacing.md }}>
          <Text accessibilityRole="alert" style={[typography.body, { color: colors.warning }]}>
            No KiteVault backup was found in {email ?? 'this Google account'}.
          </Text>
          <Button
            title="Use a different Google account"
            variant="secondary"
            onPress={() => void switchAccount()}
          />
        </View>
      ) : null}

      {searched && backup ? (
        <View style={{ gap: spacing.lg }}>
          <Text style={[typography.body, { color: colors.text }]}>
            Backup found in {email}, last updated {formatDate(Date.parse(backup.modifiedTime) || 0)}
            .
          </Text>
          <TextField
            label="Master password of the backed-up vault"
            secret
            value={password}
            onChangeText={setPassword}
            editable={busy === 'idle'}
            onSubmitEditing={() => void submit()}
          />
          <Button
            title={busy === 'restoring' ? 'Restoring…' : 'Restore vault'}
            onPress={() => void submit()}
            disabled={password.length === 0}
            loading={busy === 'restoring'}
          />
          <Button
            title="Use a different Google account"
            variant="secondary"
            onPress={() => void switchAccount()}
            disabled={busy !== 'idle'}
          />
        </View>
      ) : null}

      {error ? (
        <Text accessibilityRole="alert" style={[typography.body, { color: colors.danger }]}>
          {error}
        </Text>
      ) : null}
    </ScreenContainer>
  );
}
