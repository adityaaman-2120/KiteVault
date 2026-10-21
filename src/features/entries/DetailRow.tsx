import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

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

function ActionText({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors, typography } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8}>
      <Text style={[typography.label, { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

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
          <ActionText
            label={shown ? `Hide ${label}` : `Show ${label}`}
            onPress={() => setShown((v) => !v)}
          />
        ) : null}
        {copyable ? (
          <ActionText label={`Copy ${label}`} onPress={() => void copySecret(value)} />
        ) : null}
        {extra.map((action) => (
          <ActionText key={action.label} label={action.label} onPress={action.onPress} />
        ))}
      </View>
    </View>
  );
}
