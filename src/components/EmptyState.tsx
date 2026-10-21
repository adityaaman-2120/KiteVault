import { Text, View } from 'react-native';

import { useTheme } from '@/theme';

type Props = { title: string; message?: string };

export function EmptyState({ title, message }: Props) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}>
      <Text style={[typography.heading, { color: colors.text }]}>{title}</Text>
      {message ? (
        <Text style={[typography.body, { color: colors.textMuted, textAlign: 'center' }]}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}
