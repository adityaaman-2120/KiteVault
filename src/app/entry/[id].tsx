import { useLocalSearchParams } from 'expo-router';

import { Card, ScreenContainer } from '@/components';
import { Text } from 'react-native';

import { useTheme } from '@/theme';

export default function EntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, typography } = useTheme();

  return (
    <ScreenContainer>
      <Card>
        <Text style={[typography.label, { color: colors.textMuted }]}>Entry</Text>
        <Text style={[typography.heading, { color: colors.text }]}>{id}</Text>
      </Card>
    </ScreenContainer>
  );
}
