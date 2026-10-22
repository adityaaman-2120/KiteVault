import { createContext, useContext, type ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';

const InsideCard = createContext(false);
const InsideGroup = createContext(false);

// True for anything drawn inside a Card, so buttons there can be smaller than page-level ones.
export const useInsideCard = () => useContext(InsideCard);

export function Card({ children, flush = false }: { children: ReactNode; flush?: boolean }) {
  const { colors, elevation, isDark, radius, spacing } = useTheme();
  const inGroup = useContext(InsideGroup);

  // In a CardGroup the group is the one box. Each card becomes a row with a thin line above it.
  if (inGroup) {
    return (
      <View
        style={{
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md + 2,
          gap: spacing.sm,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <InsideCard.Provider value>{children}</InsideCard.Provider>
      </View>
    );
  }

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
      <InsideCard.Provider value>{children}</InsideCard.Provider>
    </View>
  );
}

// One rounded surface that holds several cards as rows, instead of one box per card.
export function CardGroup({ children }: { children: ReactNode }) {
  const { colors, elevation, isDark, radius } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.lg,
          overflow: 'hidden',
        },
        isDark ? null : elevation.card,
      ]}
    >
      {/* Every row draws a line above itself; pulling the content up hides the first one. */}
      <View style={{ marginTop: -1 }}>
        <InsideGroup.Provider value>{children}</InsideGroup.Provider>
      </View>
    </View>
  );
}
