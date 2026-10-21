import { Text } from 'react-native';

import { Button, Card, ScreenContainer } from '@/components';
import { useSessionStore } from '@/features/session/useSessionStore';
import { useTheme } from '@/theme';

export default function SettingsScreen() {
  const setStatus = useSessionStore((s) => s.setStatus);
  const { colors, typography } = useTheme();

  return (
    <ScreenContainer>
      <Card>
        <Text style={[typography.heading, { color: colors.text }]}>KiteVault</Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>
          Settings will appear here.
        </Text>
      </Card>
      {/* Placeholder: real locking will also wipe decrypted data from memory. */}
      <Button title="Lock vault" variant="secondary" onPress={() => setStatus('locked')} />
    </ScreenContainer>
  );
}
