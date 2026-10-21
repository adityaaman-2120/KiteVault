import { Pressable, Text, View } from 'react-native';

import { copySecret } from '@/features/clipboard/clipboardService';
import { useTheme } from '@/theme';
import type { TotpParams } from '@/vault';

import { CountdownRing } from './CountdownRing';
import { formatCode, tryGenerateCode } from './totp';

type Props = {
  secret: string;
  params?: TotpParams;
  now: number;
  compact?: boolean;
};

// The current code with a countdown ring. Tapping it copies the code through the same
// auto-clearing clipboard as passwords. The code is worked out on every render and never kept.
export function TotpCode({ secret, params, now, compact = false }: Props) {
  const { colors, spacing, typography } = useTheme();
  const code = tryGenerateCode(secret, params, now);

  if (!code) {
    return (
      <Text accessibilityRole="alert" style={[typography.body, { color: colors.danger }]}>
        The saved 2FA secret is not valid. Replace it with a new one.
      </Text>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Copy 2FA code ${code.digits.split('').join(' ')}`}
      onPress={() => void copySecret(code.digits)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}
    >
      <CountdownRing secondsLeft={code.secondsLeft} period={code.period} size={compact ? 36 : 52} />
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: code.secondsLeft <= 5 ? colors.danger : colors.text,
            fontSize: compact ? 24 : 32,
            fontWeight: '600',
            letterSpacing: 2,
            fontVariant: ['tabular-nums'],
          }}
        >
          {formatCode(code.digits)}
        </Text>
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          {code.secondsLeft} s · tap to copy
        </Text>
      </View>
    </Pressable>
  );
}
