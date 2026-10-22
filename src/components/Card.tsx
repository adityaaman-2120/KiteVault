import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';

export function Card({ children }: { children: ReactNode }) {
  const { colors, elevation, isDark, radius, spacing } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.lg,
          padding: spacing.lg,
          gap: spacing.md,
        },
        // Shadows are invisible on the dark theme, where the border does the work.
        isDark ? null : elevation.card,
      ]}
    >
      {children}
    </View>
  );
}
