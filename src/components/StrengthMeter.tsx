import { Text, View } from 'react-native';

import { useTheme } from '@/theme';

export type StrengthLevel = 0 | 1 | 2 | 3 | 4;

type Props = { score: StrengthLevel; label: string; hint?: string };

export function StrengthMeter({ score, label, hint }: Props) {
  const { colors, radius, spacing, typography } = useTheme();
  const fill = [colors.danger, colors.danger, colors.warning, colors.success, colors.success][
    score
  ];

  return (
    <View accessible accessibilityLabel={`Password strength: ${label}`} style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', gap: spacing.xs }}>
        {[1, 2, 3, 4].map((segment) => (
          <View
            key={segment}
            style={{
              flex: 1,
              height: 6,
              borderRadius: radius.pill,
              backgroundColor: score >= segment ? fill : colors.surfaceMuted,
            }}
          />
        ))}
      </View>
      <Text style={[typography.label, { color: colors.text }]}>{label}</Text>
      {hint ? <Text style={[typography.caption, { color: colors.textMuted }]}>{hint}</Text> : null}
    </View>
  );
}
