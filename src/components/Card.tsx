import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';

export function Card({ children, flush = false }: { children: ReactNode; flush?: boolean }) {
  const { colors, elevation, isDark, radius, spacing } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.lg,
          padding: flush ? 0 : spacing.lg,
          gap: flush ? 0 : spacing.md,
          overflow: 'hidden',
        },
        // Shadows are invisible on the dark theme, where the border does the work.
        isDark ? null : elevation.card,
      ]}
    >
      {children}
    </View>
  );
}
