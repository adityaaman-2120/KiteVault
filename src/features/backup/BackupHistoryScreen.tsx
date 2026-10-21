import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Button, Card, ScreenContainer, TextField } from '@/components';
import { formatDate } from '@/features/entries/format';
import { useTheme } from '@/theme';

import { describeError } from './RestoreScreen';
import { listVersions, restoreVersion } from './backupService';
import type { RemoteBackup } from './driveApi';

export function BackupHistoryScreen() {
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const [versions, setVersions] = useState<RemoteBackup[] | null>(null);
  const [selected, setSelected] = useState<RemoteBackup | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    // Not awaited inside the effect body: state is only set once the list has arrived.
    listVersions().then(setVersions, (e) => {
      setError(describeError(e));
      setVersions([]);
    });
  }, []);

  async function restore() {
    if (!selected || password.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await restoreVersion(selected, password);
      setRestored(true);
      setSelected(null);
    } catch (e) {
      setError(describeError(e));
    }
    setPassword('');
    setBusy(false);
  }

  return (
    <ScreenContainer scroll>
      <Card>
        <Text style={[typography.heading, { color: colors.text }]}>Backup history</Text>
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          The last 5 versions in your Google Drive. Restoring one first saves the vault as it is
          now, so you can go back.
        </Text>
      </Card>

      {restored ? (
        <Text accessibilityRole="alert" style={[typography.body, { color: colors.success }]}>
          Restored. The previous state was saved as a version.
        </Text>
      ) : null}

      {versions === null ? (
        <Text style={[typography.body, { color: colors.textMuted }]}>Loading…</Text>
      ) : null}
      {versions?.length === 0 && !error ? (
        <Text style={[typography.body, { color: colors.textMuted }]}>No backups yet.</Text>
      ) : null}

      {versions?.map((v, index) => (
        <Card key={v.id}>
          <Text style={[typography.body, { color: colors.text }]}>
            {formatDate(Date.parse(v.modifiedTime) || 0)}
            {index === 0 ? ' (newest)' : ''}
          </Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            {v.deviceName || 'Unknown phone'} · revision {v.revision}
          </Text>
          {selected?.id === v.id ? (
            <View style={{ gap: spacing.md }}>
              <TextField
                label="Master password this version had"
                secret
                value={password}
                onChangeText={setPassword}
                editable={!busy}
                onSubmitEditing={() => void restore()}
              />
              <Button
                title="Restore this version"
                variant="danger"
                onPress={() => void restore()}
                disabled={password.length === 0}
                loading={busy}
              />
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => {
                  setSelected(null);
                  setPassword('');
                }}
                disabled={busy}
              />
            </View>
          ) : (
            <Button
              title="Restore…"
              variant="secondary"
              onPress={() => {
                setSelected(v);
                setPassword('');
                setRestored(false);
              }}
              disabled={busy}
            />
          )}
        </Card>
      ))}

      {error ? (
        <Text accessibilityRole="alert" style={[typography.body, { color: colors.danger }]}>
          {error}
        </Text>
      ) : null}
      <Button title="Back" variant="secondary" onPress={() => router.back()} />
    </ScreenContainer>
  );
}
