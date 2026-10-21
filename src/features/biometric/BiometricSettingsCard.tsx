import { useState } from 'react';
import { Text } from 'react-native';

import { Button, Card } from '@/components';
import { disableBiometricUnlock } from '@/native/keystore';
import { useTheme } from '@/theme';

import { enableBiometric } from './biometricService';
import { describeBiometricError } from './messages';
import { useBiometricState } from './useBiometricState';

export function BiometricSettingsCard() {
  const { colors, typography } = useTheme();
  const biometric = useBiometricState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const on = biometric.state === 'ready' || biometric.state === 'reauth-required';

  async function turnOn() {
    setBusy(true);
    setError(null);
    try {
      await enableBiometric();
    } catch (e) {
      setError(describeBiometricError(e));
    }
    await biometric.refresh();
    setBusy(false);
  }

  async function turnOff() {
    disableBiometricUnlock();
    setError(null);
    await biometric.refresh();
  }

  if (!biometric.loaded) return null;

  return (
    <Card>
      <Text style={[typography.heading, { color: colors.text }]}>Biometric unlock</Text>
      {!biometric.available && !on ? (
        <Text style={[typography.body, { color: colors.textMuted }]}>
          Not available. Set up a fingerprint or face in your phone&apos;s settings first.
        </Text>
      ) : (
        <>
          <Text style={[typography.body, { color: colors.textMuted }]}>
            {on
              ? 'On. Your master password is still required after a restart, after 7 days, or after 5 biometric unlocks.'
              : 'Off. Use your fingerprint or face instead of typing your master password.'}
          </Text>
          {error ? (
            <Text accessibilityRole="alert" style={[typography.body, { color: colors.danger }]}>
              {error}
            </Text>
          ) : null}
          {on ? (
            <Button title="Turn off" variant="secondary" onPress={turnOff} />
          ) : (
            <Button title="Turn on" onPress={turnOn} loading={busy} />
          )}
        </>
      )}
    </Card>
  );
}
