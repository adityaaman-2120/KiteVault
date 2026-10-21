import { useState } from 'react';
import { Modal, Text, View } from 'react-native';

import { Button, Card, TextField } from '@/components';
import { useTheme } from '@/theme';

import { eraseEverything, ERASE_WORD, isEraseConfirmed } from './eraseVault';

export const ERASE_WARNING =
  'This will permanently erase all passwords on this device. This cannot be undone.';

export function EraseVaultCard() {
  const { colors, radius, spacing, typography } = useTheme();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (busy) return;
    setOpen(false);
    setTyped('');
    setError(null);
  }

  async function erase() {
    if (!isEraseConfirmed(typed) || busy) return;
    setBusy(true);
    setError(null);
    try {
      await eraseEverything();
      // The app moves to the welcome screen by itself.
    } catch {
      setError('The vault could not be erased, and nothing was changed. Please try again.');
      setBusy(false);
    }
  }

  return (
    <>
      <Card>
        <Text style={[typography.heading, { color: colors.danger }]}>Erase vault</Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>
          Deletes every password, note and setting from this phone.
        </Text>
        <Button title="Erase vault" variant="danger" onPress={() => setOpen(true)} />
      </Card>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            padding: spacing.xl,
            backgroundColor: 'rgba(0,0,0,0.6)',
          }}
        >
          <View
            accessibilityViewIsModal
            style={{
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              padding: spacing.xl,
              gap: spacing.lg,
              borderWidth: 2,
              borderColor: colors.danger,
            }}
          >
            <Text style={[typography.heading, { color: colors.danger }]}>Erase vault?</Text>
            <Text style={[typography.body, { color: colors.text }]}>{ERASE_WARNING}</Text>
            <TextField
              label={`Type ${ERASE_WORD} to confirm`}
              value={typed}
              onChangeText={setTyped}
              editable={!busy}
              autoCapitalize="characters"
              placeholder={ERASE_WORD}
            />
            {error ? (
              <Text accessibilityRole="alert" style={[typography.body, { color: colors.danger }]}>
                {error}
              </Text>
            ) : null}
            <Button
              title={busy ? 'Erasing…' : 'Erase everything'}
              variant="danger"
              onPress={() => void erase()}
              disabled={!isEraseConfirmed(typed)}
              loading={busy}
            />
            <Button title="Cancel" variant="secondary" onPress={close} disabled={busy} />
          </View>
        </View>
      </Modal>
    </>
  );
}
