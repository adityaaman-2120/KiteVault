import { useRouter } from 'expo-router';
import { Text } from 'react-native';

import { Button, Card } from '@/components';
import { useTheme } from '@/theme';

export function AutofillCard() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  return (
    <Card>
      <Text style={[typography.heading, { color: colors.text }]}>Autofill</Text>
      <Text style={[typography.body, { color: colors.textMuted }]}>
        Fill your logins in Chrome and other apps, after a fingerprint or face check. On sign-up
        pages KiteVault can also suggest a strong password.
      </Text>
      <Button
        title="Autofill settings"
        variant="secondary"
        onPress={() => router.push('/autofill')}
      />
    </Card>
  );
}
