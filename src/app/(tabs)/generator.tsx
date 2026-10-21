import { Button, Card, ScreenContainer } from '@/components';
import { Text } from 'react-native';

import { useTheme } from '@/theme';

export default function GeneratorScreen() {
  const { colors, typography } = useTheme();

  return (
    <ScreenContainer>
      <Card>
        <Text style={[typography.label, { color: colors.textMuted }]}>Generated password</Text>
        <Text style={[typography.heading, { color: colors.text }]}>Coming soon</Text>
      </Card>
      <Button title="Generate" disabled />
    </ScreenContainer>
  );
}
