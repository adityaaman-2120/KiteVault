import { Text, View } from 'react-native';

import { useTheme } from '@/theme';

type Props = { title: string; message?: string };

export function EmptyState({ title, message }: Props) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        padding: spacing.xl,
      }}
    >
      {/* Decorative badge: a lock-shaped mark drawn with plain views. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 88,
          height: 88,
          borderRadius: 44,
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.md,
        }}
      >
        <View
          style={{
            width: 20,
            height: 16,
            borderWidth: 4,
            borderBottomWidth: 0,
            borderColor: colors.primary,
            borderTopLeftRadius: 10,
            borderTopRightRadius: 10,
          }}
        />
        <View style={{ width: 36, height: 26, borderRadius: 8, backgroundColor: colors.primary }} />
      </View>
      <Text style={[typography.heading, { color: colors.text }]}>{title}</Text>
      {message ? (
        <Text style={[typography.body, { color: colors.textMuted, textAlign: 'center' }]}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}
