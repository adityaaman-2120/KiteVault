import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { EyeButton, TextAction } from '@/components';
import { copySecret } from '@/features/clipboard/clipboardService';
import { touch, useTheme } from '@/theme';

type Props = {
  label: string;
  value: string;
  // Hidden behind dots until the eye is pressed. Starts hidden every time the screen opens.
  secret?: boolean;
  // Shows a copy button (copies with the auto-clearing clipboard).
  copyable?: boolean;
  // Extra buttons, for example "Open" for a website.
  extra?: { label: string; onPress: () => void }[];
  // For a block that already has a heading of the same name (Notes). Still named for screen readers.
  hideLabel?: boolean;
};

// Two overlapping sheets, drawn with plain views like the other icons.
function CopyButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  const sheet = {
    position: 'absolute',
    width: 12,
    height: 14,
    borderRadius: 3,
    borderWidth: 2,
    borderColor: colors.textMuted,
  } as const;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: touch.min,
        minWidth: touch.min,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.5 : 1,
      })}
    >
      <View style={{ width: 22, height: 22 }}>
        <View style={[sheet, { left: 0, top: 0, opacity: 0.55 }]} />
        <View
          style={[sheet, { left: 7, top: 6, backgroundColor: colors.surface, borderRadius: 3 }]}
        />
      </View>
    </Pressable>
  );
}

// One line of a detail card: a small name above the value, the buttons on the right.
export function DetailRow({
  label,
  value,
  secret = false,
  copyable = true,
  extra = [],
  hideLabel = false,
}: Props) {
  const { colors, spacing, typography } = useTheme();
  const [shown, setShown] = useState(false);
  const masked = secret && !shown;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: spacing.lg,
        paddingRight: spacing.xs,
        paddingVertical: spacing.xs,
        minHeight: 60,
      }}
    >
      <View style={{ flex: 1, gap: 2, paddingVertical: spacing.sm }}>
        {hideLabel ? null : (
          <Text style={[typography.caption, { color: colors.textMuted }]}>{label}</Text>
        )}
        <Text
          selectable={!masked}
          accessibilityLabel={masked ? `${label}, hidden` : undefined}
          style={[
            typography.body,
            { color: colors.text, fontSize: 15.5, lineHeight: 22 },
            // Fixed-width letters make 0/O and l/1 easy to tell apart in a revealed password.
            secret && shown ? { fontFamily: 'monospace', letterSpacing: 0.5 } : null,
          ]}
        >
          {masked ? '••••••••••' : value}
        </Text>
      </View>
      {secret ? (
        <EyeButton
          revealed={shown}
          accessibilityLabel={shown ? `Hide ${label}` : `Show ${label}`}
          onPress={() => setShown((v) => !v)}
        />
      ) : null}
      {extra.map((action) => (
        <TextAction key={action.label} label={action.label} onPress={action.onPress} />
      ))}
      {copyable ? (
        <CopyButton label={`Copy ${label}`} onPress={() => void copySecret(value)} />
      ) : null}
    </View>
  );
}
