import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button, Card, ScreenContainer, TextField } from '@/components';
import { formatDate } from '@/features/entries/format';
import { useTheme } from '@/theme';
import type { MergeSummary } from '@/vault';

import { conflictSummary } from './BackupCard';
import { describeError } from './RestoreScreen';
import { resolveKeepMine, resolveMerge, resolveUseCloud } from './backupService';
import { useBackupState } from './backupState';

type Choice = 'cloud' | 'merge';

export function describeMerge(s: MergeSummary): string[] {
  const lines: [number, string][] = [
    [s.addedFromCloud, 'added from the cloud'],
    [s.keptHereOnly, 'only on this phone, kept'],
    [s.tookCloud, 'newer in the cloud, updated here'],
    [s.keptLocal, 'newer on this phone, kept'],
    [
      s.conflictingCopies,
      'changed on both phones: the older one was kept as a "(conflicting copy)"',
    ],
    [s.restoredFromTrash, 'deleted on one phone but edited later on the other: kept'],
    [s.keptInTrash, 'deleted on one phone after the last edit: moved to Trash, not erased'],
    [s.foldersAdded, 'folders added'],
  ];
  return lines.filter(([n]) => n > 0).map(([n, text]) => `${n} ${text}`);
}

export function BackupConflictScreen() {
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const conflict = useBackupState((s) => s.conflict);

  const [choice, setChoice] = useState<Choice | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string[] | 'done' | null>(null);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
      setChoice(null);
    } catch (e) {
      setError(describeError(e));
    }
    setPassword('');
    setBusy(false);
  }

  const keepMine = () =>
    run(async () => {
      await resolveKeepMine();
      setResult('done');
    });
  const confirm = () => {
    if (!choice || password.length === 0 || busy) return;
    return run(async () => {
      if (choice === 'cloud') {
        await resolveUseCloud(password);
        setResult('done');
      } else {
        setResult(describeMerge(await resolveMerge(password)));
      }
    });
  };

  if (result) {
    return (
      <ScreenContainer scroll>
        <Card>
          <Text style={[typography.heading, { color: colors.text }]}>Conflict resolved</Text>
          {Array.isArray(result) ? (
            <View style={{ gap: spacing.xs }}>
              <Text style={[typography.body, { color: colors.text }]}>
                Both versions were combined and uploaded. Nothing was deleted.
              </Text>
              {result.map((line) => (
                <Text key={line} style={[typography.body, { color: colors.textMuted }]}>
                  • {line}
                </Text>
              ))}
            </View>
          ) : (
            <Text style={[typography.body, { color: colors.text }]}>
              This phone and the cloud agree again. Older versions are in Backup history.
            </Text>
          )}
        </Card>
        <Button title="Done" onPress={() => router.back()} />
      </ScreenContainer>
    );
  }

  if (!conflict) {
    return (
      <ScreenContainer>
        <Text style={[typography.body, { color: colors.textMuted }]}>There is no conflict.</Text>
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
      </ScreenContainer>
    );
  }

  const when = formatDate(Date.parse(conflict.remote.modifiedTime) || 0);
  return (
    <ScreenContainer scroll>
      <Card>
        <Text style={[typography.heading, { color: colors.text }]}>Two versions of your vault</Text>
        <Text style={[typography.body, { color: colors.text }]}>{conflictSummary(conflict)}</Text>
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          Cloud version: {conflict.remote.deviceName || 'unknown phone'}, {when}. Nothing has been
          overwritten. Whatever you choose, the other version stays in Backup history.
        </Text>
      </Card>

      {choice === null ? (
        <View style={{ gap: spacing.md }}>
          <Button
            title="Keep this device's version"
            onPress={() => void keepMine()}
            loading={busy}
          />
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            Uploads this phone&apos;s vault as the newest version. Changes made on the other phone
            are not in it (they remain in the older version).
          </Text>
          <Button
            title="Use cloud version"
            variant="secondary"
            onPress={() => setChoice('cloud')}
          />
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            Replaces the vault on this phone. Changes made only on this phone are lost.
          </Text>
          <Button title="Merge" variant="secondary" onPress={() => setChoice('merge')} />
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            Combines both: the newest edit of each entry wins, nothing is deleted silently.
          </Text>
        </View>
      ) : (
        <View style={{ gap: spacing.lg }}>
          <TextField
            label="Master password of the cloud version"
            secret
            value={password}
            onChangeText={setPassword}
            editable={!busy}
            onSubmitEditing={() => void confirm()}
          />
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            Needed to open the cloud version. If you changed the master password on the other phone,
            use the new one.
          </Text>
          <Button
            title={choice === 'cloud' ? 'Replace this phone with the cloud version' : 'Merge'}
            variant={choice === 'cloud' ? 'danger' : 'primary'}
            onPress={() => void confirm()}
            disabled={password.length === 0}
            loading={busy}
          />
          <Button
            title="Cancel"
            variant="secondary"
            onPress={() => {
              setChoice(null);
              setPassword('');
              setError(null);
            }}
            disabled={busy}
          />
        </View>
      )}

      {error ? (
        <Text accessibilityRole="alert" style={[typography.body, { color: colors.danger }]}>
          {error}
        </Text>
      ) : null}
    </ScreenContainer>
  );
}
