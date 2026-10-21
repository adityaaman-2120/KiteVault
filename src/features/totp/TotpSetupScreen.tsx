import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button, Card, EmptyState, ScreenContainer, TextField } from '@/components';
import { describeSaveError } from '@/features/entries/entryActions';
import { useForceScreenProtection } from '@/features/privacy/screenProtection';
import { useTheme } from '@/theme';
import { useVaultStore } from '@/vault';

import { QrScanner } from './QrScanner';
import { parseTotpInput, TOTP_ERROR_TEXT, TotpError, type ParsedTotp } from './totp';
import { setEntryTotp } from './totpActions';

export function TotpSetupScreen({ id }: { id: string }) {
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  // The QR code and the secret are on screen here; keep them out of screenshots.
  useForceScreenProtection();
  const entry = useVaultStore((s) => s.data?.entries.find((e) => e.id === id));

  const [scanning, setScanning] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!entry || entry.deletedAt !== undefined) {
    return (
      <ScreenContainer>
        <EmptyState title="Entry not found" message="It may have been deleted." />
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
      </ScreenContainer>
    );
  }

  async function save(totp: ParsedTotp) {
    setBusy(true);
    setError(null);
    try {
      await setEntryTotp(id, totp);
      router.back();
    } catch (e) {
      setError(describeSaveError(e));
      setBusy(false);
    }
  }

  function submitText() {
    try {
      void save(parseTotpInput(text));
    } catch (e) {
      setError(e instanceof TotpError ? TOTP_ERROR_TEXT[e.code] : TOTP_ERROR_TEXT['invalid-link']);
    }
  }

  if (scanning) {
    return (
      <ScreenContainer scroll>
        <QrScanner
          onCancel={() => setScanning(false)}
          onScanned={(totp) => {
            setScanning(false);
            void save(totp);
          }}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll>
      <Card>
        <Text style={[typography.heading, { color: colors.text }]}>
          {entry.totpSecret ? 'Replace 2FA' : 'Add 2FA'} · {entry.title}
        </Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>
          Scan the QR code the website shows when you turn on two-factor authentication, or type the
          secret key it gives you. The secret is saved inside your encrypted vault.
        </Text>
      </Card>
      <Button title="Scan QR code" onPress={() => setScanning(true)} disabled={busy} />
      <View style={{ gap: spacing.md }}>
        <TextField
          label="Or paste the secret key (or an otpauth:// link)"
          secret
          value={text}
          onChangeText={(value) => {
            setText(value);
            setError(null);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!busy}
          onSubmitEditing={submitText}
        />
        <Button
          title={busy ? 'Saving…' : 'Save'}
          variant="secondary"
          onPress={submitText}
          disabled={text.trim() === ''}
          loading={busy}
        />
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={[typography.body, { color: colors.danger }]}>
          {error}
        </Text>
      ) : null}
    </ScreenContainer>
  );
}
