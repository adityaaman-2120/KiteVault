import { useRouter } from 'expo-router';
import { Text } from 'react-native';

import { Button, Card } from '@/components';
import { useTheme } from '@/theme';

export function DataTransferCard() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  return (
    <Card>
      <Text style={[typography.heading, { color: colors.text }]}>Import and export</Text>
      <Text style={[typography.body, { color: colors.textMuted }]}>
        Move passwords in from Chrome or Bitwarden, or keep an encrypted copy of your vault in a
        file.
      </Text>
      <Button title="Import…" variant="secondary" onPress={() => router.push('/import')} />
      <Button title="Export…" variant="secondary" onPress={() => router.push('/export')} />
    </Card>
  );
}
