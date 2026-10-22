import { useState } from 'react';
import { Text, View } from 'react-native';

import { TextAction } from '@/components';
import { copySecret } from '@/features/clipboard/clipboardService';
import { useTheme } from '@/theme';

type Props = {
  label: string;
  value: string;
  // Hidden behind dots until "Show" is pressed. Starts hidden every time the screen opens.
  secret?: boolean;
  // Shows a Copy button (copies with the auto-clearing clipboard).
  copyable?: boolean;
  // Extra buttons, for example "Open" for a website.
  extra?: { label: string; onPress: () => void }[];
};

export function DetailRow({ label, value, secret = false, copyable = true, extra = [] }: Props) {
  const { colors, spacing, typography } = useTheme();
  const [shown, setShown] = useState(false);
  const masked = secret && !shown;

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[typography.caption, { color: colors.textMuted }]}>{label}</Text>
      <Text
        selectable={!masked}
        accessibilityLabel={masked ? `${label}, hidden` : undefined}
        style={[typography.body, { color: colors.text }]}
      >
        {masked ? '••••••••••' : value}
      </Text>
      <View style={{ flexDirection: 'row', gap: spacing.lg }}>
        {secret ? (
          <TextAction
            label={shown ? 'Hide' : 'Show'}
            accessibilityLabel={shown ? `Hide ${label}` : `Show ${label}`}
            onPress={() => setShown((v) => !v)}
          />
        ) : null}
        {copyable ? (
          <TextAction
            label="Copy"
            accessibilityLabel={`Copy ${label}`}
            onPress={() => void copySecret(value)}
          />
        ) : null}
        {extra.map((action) => (
          <TextAction key={action.label} label={action.label} onPress={action.onPress} />
        ))}
      </View>
    </View>
  );
}
