import { Text } from 'react-native';

import { Button, Card, ChoiceGroup, ScreenContainer } from '@/components';
import { BiometricSettingsCard } from '@/features/biometric/BiometricSettingsCard';
import { PrivacySettingsCard } from '@/features/privacy/PrivacySettingsCard';
import { useTheme } from '@/theme';
import { useVaultStore } from '@/vault';

import { BACKGROUND_LOCK_OPTIONS, INACTIVITY_LOCK_OPTIONS } from './appSettings';
import { useSettingsStore } from './useSettingsStore';

export function SettingsForm() {
  const { colors, typography } = useTheme();
  const backgroundLockSeconds = useSettingsStore((s) => s.backgroundLockSeconds);
  const inactivityLockMinutes = useSettingsStore((s) => s.inactivityLockMinutes);
  const update = useSettingsStore((s) => s.update);
  const lock = useVaultStore((s) => s.lock);

  return (
    <ScreenContainer scroll>
      <Card>
        <Text style={[typography.heading, { color: colors.text }]}>Auto-lock</Text>
        <ChoiceGroup
          label="Lock after leaving the app"
          options={BACKGROUND_LOCK_OPTIONS}
          value={backgroundLockSeconds}
          onChange={(value) => void update({ backgroundLockSeconds: value })}
        />
        <ChoiceGroup
          label="Lock after inactivity"
          options={INACTIVITY_LOCK_OPTIONS}
          value={inactivityLockMinutes}
          onChange={(value) => void update({ inactivityLockMinutes: value })}
        />
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          Closing the app always locks the vault.
        </Text>
      </Card>
      <BiometricSettingsCard />
      <PrivacySettingsCard />
      <Button title="Lock now" variant="secondary" onPress={lock} />
    </ScreenContainer>
  );
}
