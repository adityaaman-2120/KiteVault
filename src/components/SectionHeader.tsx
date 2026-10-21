import { Text } from 'react-native';

import { useTheme } from '@/theme';

// A title that starts a group of settings.
export function SectionHeader({ title }: { title: string }) {
  const { colors, spacing, typography } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={[
        typography.label,
        {
          color: colors.primary,
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginTop: spacing.md,
        },
      ]}
    >
      {title}
    </Text>
  );
}
