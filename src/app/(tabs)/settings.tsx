import { Text } from 'react-native';

import { Button, Card, ScreenContainer } from '@/components';
import { useTheme } from '@/theme';
import { useVaultStore } from '@/vault';

export default function SettingsScreen() {
  const lock = useVaultStore((s) => s.lock);
  const { colors, typography } = useTheme();

  return (
    <ScreenContainer>
      <Card>
        <Text style={[typography.heading, { color: colors.text }]}>KiteVault</Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>
          Settings will appear here.
        </Text>
      </Card>
      <Button title="Lock vault" variant="secondary" onPress={lock} />
    </ScreenContainer>
  );
}
