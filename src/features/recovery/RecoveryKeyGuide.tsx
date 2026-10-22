import { Text, View } from 'react-native';

import { useTheme } from '@/theme';
import { RECOVERY_GROUPS, RECOVERY_KEY_CHARACTERS } from '@/vault';

const GROUP_LENGTH = RECOVERY_KEY_CHARACTERS / RECOVERY_GROUPS;

type Props = {
  // How many key characters have been typed so far. Only the count is used, never the text.
  typed: number;
};

// A short instruction that points at the key box under it, with the 8 groups filling up as you
// type, so nobody stops after a single group. The arrow at the bottom edge points down at the box.
export function RecoveryKeyGuide({ typed }: Props) {
  const { colors, radius, spacing, typography } = useTheme();
  const complete = Math.min(RECOVERY_GROUPS, Math.floor(typed / GROUP_LENGTH));
  const groups = Array.from({ length: RECOVERY_GROUPS }, (_, i) => i);

  return (
    <View style={{ marginBottom: spacing.sm }}>
      <View
        style={{
          gap: spacing.sm,
          padding: spacing.md,
          borderRadius: radius.lg,
          backgroundColor: colors.primarySoft,
        }}
      >
        <Text accessibilityRole="header" style={[typography.heading, { color: colors.text }]}>
          Enter the whole recovery key
        </Text>
        <Text style={[typography.body, { color: colors.text }]}>
          Your key has <Text style={{ fontWeight: '700' }}>8 groups of 7 characters</Text>. Type or
          paste all 8, in order, into the box below. One group on its own is not enough.
        </Text>

        {/* One small box per group, filling up as the key is typed. */}
        <View
          accessible
          accessibilityLabel={`${complete} of ${RECOVERY_GROUPS} groups entered`}
          style={{ flexDirection: 'row', gap: spacing.xs }}
        >
          {groups.map((i) => {
            const done = i < complete;
            return (
              <View
                key={i}
                importantForAccessibility="no-hide-descendants"
                style={{
                  flex: 1,
                  paddingVertical: spacing.xs + 2,
                  alignItems: 'center',
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderColor: done ? colors.success : colors.border,
                  backgroundColor: done ? colors.success : colors.surface,
                }}
              >
                <Text
                  style={[
                    typography.caption,
                    { color: done ? colors.onPrimary : colors.textMuted, fontWeight: '700' },
                  ]}
                >
                  {done ? `✓ ${i + 1}` : `${i + 1}`}
                </Text>
              </View>
            );
          })}
        </View>

        <Text style={[typography.caption, { color: colors.textMuted }]}>
          Dashes and spaces are fine, and capitals do not matter.
        </Text>
      </View>

      {/* The arrow: a triangle under the card, pointing down at the key box. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          position: 'absolute',
          bottom: -spacing.sm - 2,
          left: spacing.xl,
          width: 0,
          height: 0,
          borderLeftWidth: 12,
          borderRightWidth: 12,
          borderTopWidth: 12,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderTopColor: colors.primarySoft,
        }}
      />
    </View>
  );
}
