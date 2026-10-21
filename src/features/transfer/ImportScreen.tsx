import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { Button, Card, ScreenContainer, TextField, ToggleRow } from '@/components';
import { useForceScreenProtection } from '@/features/privacy/screenProtection';
import { useTheme } from '@/theme';
import { useVaultStore } from '@/vault';

import { describeTransferError } from './errors';
import { applyImport, planImport } from './importPlan';
import { classifyImport, openFileManager, pickImportFile, readKvault } from './importFiles';
import { FORMAT_LABELS, isPlainFormat, type ParsedImport } from './types';

export const DELETE_FILE_NOTICE =
  'The file you imported is NOT encrypted. It still contains every password in plain text. Delete it now, and empty the trash or recycle bin of the app you keep it in.';

type Step = 'start' | 'password' | 'preview' | 'done';

export function ImportScreen() {
  const router = useRouter();
  const { colors, radius, spacing, typography } = useTheme();
  useForceScreenProtection();
  const data = useVaultStore((s) => s.data);
  const save = useVaultStore((s) => s.save);

  const [step, setStep] = useState<Step>('start');
  const [encrypted, setEncrypted] = useState<Uint8Array | null>(null);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [password, setPassword] = useState('');
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);

  const plan = useMemo(
    () => (parsed && data ? planImport(data, parsed.entries) : null),
    [parsed, data],
  );

  async function chooseFile() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const bytes = await pickImportFile();
      if (bytes) {
        const classified = classifyImport(bytes);
        if (classified.kind === 'kvault') {
          setEncrypted(classified.bytes);
          setStep('password');
        } else {
          setParsed(classified.parsed);
          setStep('preview');
        }
      }
    } catch (e) {
      setError(describeTransferError(e));
    }
    setBusy(false);
  }

  async function openKvault() {
    if (!encrypted || password.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      setParsed(await readKvault(encrypted, password));
      setEncrypted(null);
      setStep('preview');
    } catch (e) {
      setError(describeTransferError(e));
    }
    setPassword('');
    setBusy(false);
  }

  async function runImport() {
    if (!data || !plan || !parsed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = applyImport(data, plan, { skipDuplicates });
      await save(outcome.data);
      setResult({ imported: outcome.imported, skipped: outcome.skipped });
      setStep('done');
    } catch (e) {
      setError(describeTransferError(e));
    }
    setBusy(false);
  }

  function startOver() {
    setStep('start');
    setParsed(null);
    setEncrypted(null);
    setPassword('');
    setError(null);
  }

  const toImport = plan ? (skipDuplicates ? plan.fresh : plan.items.length) : 0;
  const plain = parsed ? isPlainFormat(parsed.format) : false;

  return (
    <ScreenContainer scroll>
      {step === 'start' ? (
        <>
          <Card>
            <Text style={[typography.heading, { color: colors.text }]}>Import passwords</Text>
            <Text style={[typography.body, { color: colors.textMuted }]}>
              Choose a file to import. You see what it contains before anything is added.
            </Text>
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              Supported: Chrome passwords (CSV), Bitwarden (CSV or JSON) and KiteVault .kvault
              files. Entries are added to your vault; nothing existing is changed or removed.
            </Text>
            <Button
              title={busy ? 'Reading…' : 'Choose a file'}
              onPress={() => void chooseFile()}
              loading={busy}
            />
          </Card>
        </>
      ) : null}

      {step === 'password' ? (
        <View style={{ gap: spacing.lg }}>
          <Text style={[typography.body, { color: colors.text }]}>
            This is an encrypted KiteVault backup. Enter the master password it had when it was
            exported.
          </Text>
          <TextField
            label="Master password of the backup file"
            secret
            value={password}
            onChangeText={setPassword}
            editable={!busy}
            onSubmitEditing={() => void openKvault()}
          />
          <Button
            title="Open backup"
            onPress={() => void openKvault()}
            disabled={password.length === 0}
            loading={busy}
          />
          <Button title="Cancel" variant="secondary" onPress={startOver} disabled={busy} />
        </View>
      ) : null}

      {step === 'preview' && parsed && plan ? (
        <View style={{ gap: spacing.lg }}>
          <Card>
            <Text style={[typography.heading, { color: colors.text }]}>
              {FORMAT_LABELS[parsed.format]}
            </Text>
            <Text style={[typography.body, { color: colors.text }]}>
              {plan.items.length} {plan.items.length === 1 ? 'entry' : 'entries'} found
            </Text>
            <Text style={[typography.body, { color: colors.text }]}>
              {plan.fresh} new · {plan.duplicates} already in your vault
            </Text>
            {parsed.skipped > 0 ? (
              <Text style={[typography.caption, { color: colors.textMuted }]}>
                {parsed.skipped} empty {parsed.skipped === 1 ? 'row was' : 'rows were'} ignored.
              </Text>
            ) : null}
          </Card>
          {plan.duplicates > 0 ? (
            <ToggleRow
              label="Skip duplicates"
              description="Leaves out entries that match one already in your vault (same name, user name, address and password)."
              value={skipDuplicates}
              onChange={setSkipDuplicates}
            />
          ) : null}
          {plain ? (
            <Text style={[typography.caption, { color: colors.warning }]}>
              This file is not encrypted. You will be reminded to delete it after the import.
            </Text>
          ) : null}
          <Button
            title={
              toImport === 0
                ? 'Nothing to import'
                : `Import ${toImport} ${toImport === 1 ? 'entry' : 'entries'}`
            }
            onPress={() => void runImport()}
            disabled={toImport === 0}
            loading={busy}
          />
          <Button title="Cancel" variant="secondary" onPress={startOver} disabled={busy} />
        </View>
      ) : null}

      {step === 'done' && result ? (
        <View style={{ gap: spacing.lg }}>
          <Card>
            <Text style={[typography.heading, { color: colors.text }]}>Import finished</Text>
            <Text style={[typography.body, { color: colors.text }]}>
              Added {result.imported} {result.imported === 1 ? 'entry' : 'entries'}
              {result.skipped > 0 ? `, skipped ${result.skipped} duplicates` : ''}.
            </Text>
          </Card>
          {plain ? (
            <View
              accessibilityRole="alert"
              style={{
                borderWidth: 2,
                borderColor: colors.danger,
                borderRadius: radius.md,
                padding: spacing.lg,
                gap: spacing.md,
              }}
            >
              <Text style={[typography.heading, { color: colors.danger }]}>
                Delete the file now
              </Text>
              <Text style={[typography.body, { color: colors.text }]}>{DELETE_FILE_NOTICE}</Text>
              <Button
                title="Open file manager"
                variant="danger"
                onPress={() => void openFileManager()}
              />
            </View>
          ) : null}
          <Button title="Done" onPress={() => router.back()} />
        </View>
      ) : null}

      {error ? (
        <Text accessibilityRole="alert" style={[typography.body, { color: colors.danger }]}>
          {error}
        </Text>
      ) : null}
      {step === 'start' ? (
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
      ) : null}
    </ScreenContainer>
  );
}
