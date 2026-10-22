import { Text } from 'react-native';

import { useTheme } from '@/theme';

// A title that starts a group of settings.
export function SectionHeader({ title }: { title: string }) {
  const { colors, spacing, typography } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={[
        typography.caption,
        {
          color: colors.textMuted,
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: 1.2,
          marginLeft: spacing.xs,
        },
      ]}
    >
      {title}
    </Text>
  );
}
