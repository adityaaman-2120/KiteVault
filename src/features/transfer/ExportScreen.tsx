import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Button, Card, ScreenContainer, TextField } from '@/components';
import { useForceScreenProtection } from '@/features/privacy/screenProtection';
import { useTheme } from '@/theme';

import { CSV_NOT_ENCRYPTED_WARNING } from './csvExport';
import { describeTransferError } from './errors';
import {
  type ExportDestination,
  type ExportFormat,
  type ExportResult,
  exportVault,
  isPlainExport,
  purgeExportFiles,
} from './exportFiles';

export const KVAULT_NOTE =
  'An encrypted copy of your whole vault, for restoring in KiteVault. It looks like unreadable data if you open it in another app: that is normal, and other apps cannot read it. It opens only with your master password (or recovery key) as it is now. If you change the master password later, this file still needs the old password.';

export function ExportScreen() {
  const router = useRouter();
  const { colors, radius, spacing, typography } = useTheme();
  useForceScreenProtection();

  const [advanced, setAdvanced] = useState(false);
  const [mode, setMode] = useState<ExportFormat | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<ExportDestination | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<(ExportResult & { format: ExportFormat }) | null>(null);

  // A file left behind by an earlier export (for example if the app was closed while sharing).
  useEffect(() => purgeExportFiles(), []);

  async function run(destination: ExportDestination) {
    if (!mode || password.length === 0 || busy) return;
    setBusy(destination);
    setError(null);
    try {
      const result = await exportVault(mode, password, destination);
      setDone({ ...result, format: mode });
      setMode(null);
    } catch (e) {
      setError(describeTransferError(e));
    }
    setPassword('');
    setBusy(null);
  }

  function choose(format: ExportFormat) {
    setDone(null);
    setError(null);
    setMode(format);
  }

  const warning = (
    <View
      accessibilityRole="alert"
      style={{
        borderWidth: 2,
        borderColor: colors.danger,
        borderRadius: radius.md,
        padding: spacing.lg,
        gap: spacing.sm,
      }}
    >
      <Text style={[typography.heading, { color: colors.danger }]}>This file is NOT encrypted</Text>
      <Text style={[typography.body, { color: colors.text }]}>{CSV_NOT_ENCRYPTED_WARNING}</Text>
    </View>
  );

  const plain = mode !== null && isPlainExport(mode);
  const noun =
    done?.format === 'kvault' ? 'encrypted backup' : done?.format === 'json' ? 'JSON file' : 'CSV';

  return (
    <ScreenContainer scroll>
      {done ? (
        <Card>
          <Text style={[typography.heading, { color: colors.text }]}>Exported</Text>
          <Text style={[typography.body, { color: colors.text }]}>
            {done.destination === 'folder'
              ? `Saved ${done.count} ${done.count === 1 ? 'entry' : 'entries'} as ${done.fileName} in the folder you chose.`
              : `The ${noun} was handed to the app you chose. KiteVault keeps no copy of it.`}
            {isPlainExport(done.format)
              ? ' It is NOT encrypted: delete it as soon as you have used it.'
              : ' It is encrypted: it opens only with your master password.'}
          </Text>
        </Card>
      ) : null}

      {mode === null ? (
        <>
          <Card>
            <Text style={[typography.heading, { color: colors.text }]}>Backup (.kvault)</Text>
            <Text style={[typography.body, { color: colors.textMuted }]}>{KVAULT_NOTE}</Text>
            <Button title="Export encrypted backup" onPress={() => choose('kvault')} />
          </Card>
          <Card>
            <Text style={[typography.heading, { color: colors.danger }]}>
              For Chrome, Edge or Google (CSV, not encrypted)
            </Text>
            <Text style={[typography.body, { color: colors.textMuted }]}>
              Use this to move to Chrome, Edge, Google Password Manager or a spreadsheet. Logins
              only: notes, cards and identities are left out, and so are items in the Trash.
            </Text>
            <Button
              title="Export for Chrome / Edge…"
              variant="danger"
              onPress={() => choose('csv-chrome')}
            />
          </Card>
          <Button
            title={advanced ? 'Hide advanced formats' : 'Advanced formats'}
            variant="secondary"
            onPress={() => setAdvanced(!advanced)}
          />
          {advanced ? (
            <>
              <Card>
                <Text style={[typography.heading, { color: colors.danger }]}>
                  Plain JSON (not encrypted)
                </Text>
                <Text style={[typography.body, { color: colors.textMuted }]}>
                  For Bitwarden, 1Password or Proton Pass. The fullest readable copy: logins, notes,
                  cards, identities, folders, dates and extra fields.
                </Text>
                <Button
                  title="Export as plain JSON…"
                  variant="danger"
                  onPress={() => choose('json')}
                />
              </Card>
              <Card>
                <Text style={[typography.heading, { color: colors.danger }]}>
                  Bitwarden CSV (not encrypted)
                </Text>
                <Text style={[typography.body, { color: colors.textMuted }]}>
                  Logins and notes with extra fields, folders and authenticator codes, in
                  Bitwarden's column layout.
                </Text>
                <Button
                  title="Export as plain CSV…"
                  variant="danger"
                  onPress={() => choose('csv')}
                />
              </Card>
            </>
          ) : null}
        </>
      ) : (
        <View style={{ gap: spacing.lg }}>
          {plain ? warning : null}
          <TextField
            label="Enter your master password to continue"
            secret
            value={password}
            onChangeText={setPassword}
            editable={!busy}
            onSubmitEditing={() => void run('folder')}
          />
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            Android does not let apps use the Downloads folder itself or the top of your storage.
            Choose or create a folder inside, for example Documents, or use Share and pick Files.
          </Text>
          <Button
            title="Save to a folder on this phone"
            variant={plain ? 'danger' : 'primary'}
            onPress={() => void run('folder')}
            disabled={password.length === 0 || busy !== null}
            loading={busy === 'folder'}
          />
          <Button
            title="Share to another app"
            variant="secondary"
            onPress={() => void run('share')}
            disabled={password.length === 0 || busy !== null}
            loading={busy === 'share'}
          />
          <Button
            title="Cancel"
            variant="secondary"
            onPress={() => {
              setMode(null);
              setPassword('');
              setError(null);
            }}
            disabled={busy !== null}
          />
        </View>
      )}

      {error ? (
        <Text accessibilityRole="alert" style={[typography.body, { color: colors.danger }]}>
          {error}
        </Text>
      ) : null}
      {mode === null ? (
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
      ) : null}
    </ScreenContainer>
  );
}
