import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '@/theme';

type Props = {
  // Sets the colour of the bar on the left and of the title.
  tone?: 'info' | 'warning' | 'success' | 'danger';
  title?: string;
  children: ReactNode;
};

// A note that stands out from the page: a soft box with a coloured bar on its left edge. For
// warnings ("only save this if you typed it yourself") and for short explanations. The text stays
// in the normal colours, so it reads on the box in the light and the dark theme.
export function Callout({ tone = 'info', title, children }: Props) {
  const { colors, radius, spacing, typography } = useTheme();
  const accent = {
    info: colors.primary,
    warning: colors.warning,
    success: colors.success,
    danger: colors.danger,
  }[tone];

  return (
    <View
      style={{
        flexDirection: 'row',
        borderRadius: radius.md,
        backgroundColor: colors.surfaceMuted,
        overflow: 'hidden',
      }}
    >
      <View style={{ width: 5, backgroundColor: accent }} />
      <View style={{ flex: 1, padding: spacing.md, gap: spacing.xs }}>
        {title ? (
          <Text style={[typography.label, { color: accent, fontWeight: '700' }]}>{title}</Text>
        ) : null}
        {typeof children === 'string' ? (
          <Text style={[typography.body, { color: colors.text }]}>{children}</Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}
