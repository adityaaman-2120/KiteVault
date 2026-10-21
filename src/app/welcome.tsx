import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { Button, ScreenContainer } from '@/components';
import { useTheme } from '@/theme';

export default function WelcomeScreen() {
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();

  return (
    <ScreenContainer>
      <View style={{ flex: 1, justifyContent: 'center', gap: spacing.md }}>
        <Text style={[typography.title, { color: colors.text }]}>KiteVault</Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>
          Your passwords, stored only on this device.
        </Text>
      </View>
      <Button title="Create vault" onPress={() => router.push('/create-vault')} />
    </ScreenContainer>
  );
}
