import { useRouter } from 'expo-router';
import { Text } from 'react-native';

import { Button, Card, ChoiceGroup, ScreenContainer, SectionHeader } from '@/components';
import { appVersion } from '@/features/about/AboutScreen';
import { BiometricSettingsCard } from '@/features/biometric/BiometricSettingsCard';
import { DataInfoCard } from '@/features/data/DataInfoCard';
import { EraseVaultCard } from '@/features/data/EraseVaultCard';
import { PrivacySettingsCard } from '@/features/privacy/PrivacySettingsCard';
import { RecoveryKeyCard } from '@/features/recovery/RecoveryKeyCard';
import { useTheme } from '@/theme';
import { useVaultStore } from '@/vault';

import { BACKGROUND_LOCK_OPTIONS, INACTIVITY_LOCK_OPTIONS } from './appSettings';
import { useSettingsStore } from './useSettingsStore';

export function SettingsForm() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const backgroundLockSeconds = useSettingsStore((s) => s.backgroundLockSeconds);
  const inactivityLockMinutes = useSettingsStore((s) => s.inactivityLockMinutes);
  const update = useSettingsStore((s) => s.update);
  const lock = useVaultStore((s) => s.lock);

  return (
    <ScreenContainer scroll>
      <SectionHeader title="Security" />
      <Card>
        <Text style={[typography.heading, { color: colors.text }]}>Master password</Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>
          Change the password that unlocks your vault.
        </Text>
        <Button
          title="Change master password"
          variant="secondary"
          onPress={() => router.push('/change-password')}
        />
      </Card>
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
      <RecoveryKeyCard />
      <BiometricSettingsCard />
      <PrivacySettingsCard />
      <Button title="Lock now" variant="secondary" onPress={lock} />

      <SectionHeader title="Backup" />
      <Card>
        <Text style={[typography.heading, { color: colors.text }]}>Encrypted cloud backup</Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>
          Back up your vault to your own Google Drive. Coming in a future version.
        </Text>
      </Card>

      <SectionHeader title="Data" />
      <DataInfoCard />
      <EraseVaultCard />

      <SectionHeader title="About" />
      <Card>
        <Text style={[typography.heading, { color: colors.text }]}>KiteVault</Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>
          Version {appVersion()} · by Kitelux
        </Text>
        <Button title="About KiteVault" variant="secondary" onPress={() => router.push('/about')} />
      </Card>
    </ScreenContainer>
  );
}
