import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

type Props = {
  title: string;
  subtitle?: string;
  // A small picture in a tinted circle, left of the title.
  icon?: ReactNode;
  // Buttons on the right, for example the lock button.
  actions?: ReactNode;
};

// The dark panel at the top of a main screen, with rounded bottom corners. It sits under the
// status bar, so the screen using it turns its own navigation header off.
export function ScreenHeader({ title, subtitle, icon, actions }: Props) {
  const { colors, radius, spacing, typography } = useTheme();
  return (
    <SafeAreaView
      edges={['top']}
      style={{
        backgroundColor: colors.header,
        borderBottomLeftRadius: radius.xl,
        borderBottomRightRadius: radius.xl,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.md,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.sm,
          paddingBottom: spacing.lg,
        }}
      >
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          {icon ? (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(255,181,71,0.2)',
              }}
            >
              {icon}
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" style={[typography.title, { color: colors.onHeader }]}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={[typography.caption, { color: colors.onHeader, opacity: 0.7 }]}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
        {actions ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            {actions}
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
