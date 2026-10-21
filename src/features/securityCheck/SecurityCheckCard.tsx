import { useRouter } from 'expo-router';
import { Text } from 'react-native';

import { Button, Card } from '@/components';
import { useTheme } from '@/theme';

export function SecurityCheckCard() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  return (
    <Card>
      <Text style={[typography.heading, { color: colors.text }]}>Security check</Text>
      <Text style={[typography.body, { color: colors.textMuted }]}>
        Finds weak, reused and old passwords, and logins without a password. Runs on this phone.
      </Text>
      <Button
        title="Open security check"
        variant="secondary"
        onPress={() => router.push('/security-check')}
      />
    </Card>
  );
}
