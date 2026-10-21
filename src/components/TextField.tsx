import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme';

type Props = Omit<TextInputProps, 'style' | 'secureTextEntry'> & {
  label: string;
  // Hides the text by default and adds a show/hide toggle.
  secret?: boolean;
};

export function TextField({ label, secret = false, ...inputProps }: Props) {
  const { colors, radius, spacing, typography } = useTheme();
  const [revealed, setRevealed] = useState(false);

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[typography.label, { color: colors.textMuted }]}>{label}</Text>
      <View
        style={[
          styles.row,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
          },
        ]}
      >
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          {...inputProps}
          accessibilityLabel={label}
          secureTextEntry={secret && !revealed}
          // Keep secrets out of keyboard suggestions and autofill.
          autoComplete={secret ? 'off' : inputProps.autoComplete}
          importantForAutofill={secret ? 'no' : inputProps.importantForAutofill}
          placeholderTextColor={colors.textMuted}
          style={[typography.body, styles.input, { color: colors.text }]}
        />
        {secret ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide' : 'Show'}
            onPress={() => setRevealed((v) => !v)}
            hitSlop={8}
          >
            <Text style={[typography.label, { color: colors.primary }]}>
              {revealed ? 'Hide' : 'Show'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, minHeight: 48 },
  input: { flex: 1, paddingVertical: 10 },
});
