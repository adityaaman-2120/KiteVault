import { Text } from 'react-native';

import { Card } from '@/components';
import { useTheme } from '@/theme';

export const DATA_INFO =
  'Uninstalling the app also deletes all local data. If you enabled cloud backup, your encrypted backup stays in your Google Drive until you delete it.';

export function DataInfoCard() {
  const { colors, typography } = useTheme();
  return (
    <Card>
      <Text style={[typography.heading, { color: colors.text }]}>Your data</Text>
      <Text style={[typography.body, { color: colors.textMuted }]}>{DATA_INFO}</Text>
    </Card>
  );
}
