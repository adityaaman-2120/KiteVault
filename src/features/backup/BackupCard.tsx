import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Alert, Text, View } from 'react-native';

import { Button, Card, ToggleRow } from '@/components';
import { formatDate } from '@/features/entries/format';
import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { useTheme } from '@/theme';

import {
  backupNow,
  deleteCloudBackup,
  enableBackup,
  refreshSignIn,
  setAutoBackup,
  signOutOfBackup,
} from './backupService';
import { useBackupState, type ConflictInfo } from './backupState';
import { isCloudBackupAvailable } from './config';
import { BackupError, describeBackupError } from './errors';

export const BACKUP_PRIVACY =
  'Your vault is encrypted on this phone before it is uploaded. Google, and anyone who gets into your Google account, only ever sees the encrypted file. Signing in with Google alone cannot open it: your master password is still needed.';

export function conflictSummary(conflict: ConflictInfo): string {
  if (conflict.relation === 'unrelated') {
    return 'Your Google Drive holds a backup that this phone has not seen.';
  }
  const from = conflict.remote.deviceName ? ` by ${conflict.remote.deviceName}` : '';
  return conflict.relation === 'diverged'
    ? `The backup was changed${from} and this phone has changes of its own.`
    : `The backup was changed${from} since this phone last looked.`;
}

export function BackupCard() {
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const enabled = useSettingsStore((s) => s.backupEnabled);
  const auto = useSettingsStore((s) => s.backupAuto);
  const lastBackupAt = useSettingsStore((s) => s.backupLastAt);
  const pending = useSettingsStore((s) => s.backupPending);
  const { email, busy, error, conflict } = useBackupState();
  const working = busy !== 'idle';

  useEffect(() => {
    void refreshSignIn();
  }, [enabled]);

  if (!isCloudBackupAvailable()) {
    return (
      <Card>
        <Text style={[typography.heading, { color: colors.text }]}>Encrypted cloud backup</Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>
          Not available in this version of the app.
        </Text>
      </Card>
    );
  }

  const fail = (e: unknown) => Alert.alert('Cloud backup', describeBackupError(e));

  async function turnOn() {
    try {
      await enableBackup();
      await backupNow();
    } catch (e) {
      // A conflict is shown as a choice below; anything else is reported once.
      if (
        !(e instanceof BackupError && e.kind === 'conflict') &&
        !(e instanceof BackupError && e.kind === 'cancelled')
      ) {
        fail(e);
      }
    }
  }

  function confirmDelete() {
    Alert.alert(
      'Delete the cloud backup?',
      'The encrypted backup is removed from your Google Drive for good, and automatic backup is switched off. Your vault on this phone is not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete backup',
          style: 'destructive',
          onPress: () => void deleteCloudBackup().catch(fail),
        },
      ],
    );
  }

  if (!enabled) {
    return (
      <Card>
        <Text style={[typography.heading, { color: colors.text }]}>Encrypted cloud backup</Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>
          Optional. Keep an encrypted copy of your vault in a hidden folder of your own Google
          Drive, so you can restore it on a new phone. KiteVault can only see its own folder.
        </Text>
        <Text style={[typography.caption, { color: colors.textMuted }]}>{BACKUP_PRIVACY}</Text>
        {error ? (
          <Text accessibilityRole="alert" style={[typography.body, { color: colors.danger }]}>
            {describeBackupError(new BackupError(error))}
          </Text>
        ) : null}
        <Button
          title={busy === 'signing-in' ? 'Signing in…' : 'Turn on cloud backup'}
          onPress={() => void turnOn()}
          loading={working}
        />
      </Card>
    );
  }

  const needsSignIn =
    error === 'not-signed-in' ||
    error === 'access-revoked' ||
    error === 'auth-expired' ||
    error === 'scope-denied';

  return (
    <Card>
      <Text style={[typography.heading, { color: colors.text }]}>Encrypted cloud backup</Text>
      <Text style={[typography.body, { color: colors.text }]}>
        {email ? `Signed in as ${email}` : 'Signed in to Google'}
      </Text>
      <Text style={[typography.body, { color: colors.textMuted }]}>
        {lastBackupAt > 0 ? `Last backup: ${formatDate(lastBackupAt)}` : 'No backup made yet'}
        {pending && lastBackupAt > 0 ? ' (newer changes not uploaded yet)' : ''}
      </Text>
      <Text style={[typography.caption, { color: colors.textMuted }]}>{BACKUP_PRIVACY}</Text>

      {error && !conflict ? (
        <Text accessibilityRole="alert" style={[typography.body, { color: colors.danger }]}>
          {describeBackupError(new BackupError(error))}
        </Text>
      ) : null}

      {conflict ? (
        <View style={{ gap: spacing.sm }}>
          <Text accessibilityRole="alert" style={[typography.body, { color: colors.warning }]}>
            {conflictSummary(conflict)} Nothing was overwritten.
          </Text>
          <Button title="Resolve" onPress={() => router.push('/backup-conflict')} />
        </View>
      ) : null}

      {needsSignIn ? (
        <Button title="Sign in to Google again" onPress={() => void turnOn()} loading={working} />
      ) : null}

      <ToggleRow
        label="Back up automatically after changes"
        description="A short while after you save, the encrypted file is uploaded."
        value={auto}
        onChange={(value) => void setAutoBackup(value)}
      />
      <Button
        title={busy === 'backing-up' ? 'Backing up…' : 'Back up now'}
        onPress={() =>
          void backupNow().catch(
            (e) => !(e instanceof BackupError && e.kind === 'conflict') && fail(e),
          )
        }
        loading={busy === 'backing-up'}
        disabled={working && busy !== 'backing-up'}
      />
      <Button
        title="Backup history"
        variant="secondary"
        onPress={() => router.push('/backup-history')}
        disabled={working}
      />
      <Button
        title="Sign out"
        variant="secondary"
        onPress={() => void signOutOfBackup()}
        disabled={working}
      />
      <Button
        title="Delete cloud backup"
        variant="danger"
        onPress={confirmDelete}
        disabled={working}
      />
      <Text style={[typography.caption, { color: colors.textMuted }]}>
        Signing out keeps the backup in your Google Drive. You can also remove the access KiteVault
        has in your Google account settings.
      </Text>
    </Card>
  );
}
