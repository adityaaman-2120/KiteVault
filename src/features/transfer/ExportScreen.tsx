import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Button, Card, ScreenContainer, TextField } from '@/components';
import { useForceScreenProtection } from '@/features/privacy/screenProtection';
import { useTheme } from '@/theme';

import { CSV_NOT_ENCRYPTED_WARNING } from './csvExport';
import { describeTransferError } from './errors';
import { exportEncrypted, exportPlainCsv, purgeExportFiles } from './exportFiles';

export const KVAULT_NOTE =
  'An encrypted copy of your vault. It opens only with your master password (or recovery key) as it is now. If you change the master password later, this file still needs the old one.';

type Mode = 'kvault' | 'csv';

export function ExportScreen() {
  const router = useRouter();
  const { colors, radius, spacing, typography } = useTheme();
  useForceScreenProtection();

  const [mode, setMode] = useState<Mode | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Mode | null>(null);

  // A file left behind by an earlier export (for example if the app was closed while sharing).
  useEffect(() => purgeExportFiles(), []);

  async function run() {
    if (!mode || password.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'kvault') await exportEncrypted(password);
      else await exportPlainCsv(password);
      setDone(mode);
      setMode(null);
    } catch (e) {
      setError(describeTransferError(e));
    }
    setPassword('');
    setBusy(false);
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

  return (
    <ScreenContainer scroll>
      {done ? (
        <Card>
          <Text style={[typography.heading, { color: colors.text }]}>Exported</Text>
          <Text style={[typography.body, { color: colors.text }]}>
            {done === 'kvault'
              ? 'The encrypted backup was handed to the app you chose. KiteVault keeps no copy of it.'
              : 'The CSV was handed to the app you chose. Delete it from there as soon as you have used it.'}
          </Text>
        </Card>
      ) : null}

      {mode === null ? (
        <>
          <Card>
            <Text style={[typography.heading, { color: colors.text }]}>
              Encrypted backup (.kvault)
            </Text>
            <Text style={[typography.body, { color: colors.textMuted }]}>{KVAULT_NOTE}</Text>
            <Button
              title="Export encrypted backup"
              onPress={() => {
                setDone(null);
                setError(null);
                setMode('kvault');
              }}
            />
          </Card>
          <Card>
            <Text style={[typography.heading, { color: colors.danger }]}>
              Plain CSV (not encrypted)
            </Text>
            <Text style={[typography.body, { color: colors.textMuted }]}>
              For moving to another password manager. Logins and notes; items in the Trash are left
              out.
            </Text>
            <Button
              title="Export as plain CSV…"
              variant="danger"
              onPress={() => {
                setDone(null);
                setError(null);
                setMode('csv');
              }}
            />
          </Card>
        </>
      ) : (
        <View style={{ gap: spacing.lg }}>
          {mode === 'csv' ? warning : null}
          <TextField
            label="Enter your master password to continue"
            secret
            value={password}
            onChangeText={setPassword}
            editable={!busy}
            onSubmitEditing={() => void run()}
          />
          <Button
            title={mode === 'csv' ? 'Export unencrypted CSV' : 'Export encrypted backup'}
            variant={mode === 'csv' ? 'danger' : 'primary'}
            onPress={() => void run()}
            disabled={password.length === 0}
            loading={busy}
          />
          <Button
            title="Cancel"
            variant="secondary"
            onPress={() => {
              setMode(null);
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
      {mode === null ? (
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
      ) : null}
    </ScreenContainer>
  );
}
