import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme';

import { EyeButton } from './EyeButton';
import { markActivity } from '@/utils/activity';

type Props = Omit<TextInputProps, 'style' | 'secureTextEntry'> & {
  label: string;
  // Validation message shown under the field.
  error?: string;
  // Hides the text by default and adds a show/hide toggle.
  secret?: boolean;
};

// Every place in the app where you type uses this one look: a rectangle a little darker than
// the page that never changes, no outline, and a line under it that lights up while you type.
export function TextField({ label, secret = false, error, ...inputProps }: Props) {
  const { colors, radius, spacing, typography } = useTheme();
  const [revealed, setRevealed] = useState(false);
  const [focused, setFocused] = useState(false);
  const underline = error ? colors.danger : focused ? colors.primary : 'transparent';

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[typography.label, { color: focused ? colors.primary : colors.textMuted }]}>
        {label}
      </Text>
      <View
        style={[
          styles.row,
          {
            backgroundColor: colors.field,
            borderBottomColor: underline,
            borderTopLeftRadius: radius.sm,
            borderTopRightRadius: radius.sm,
            paddingHorizontal: spacing.md,
          },
        ]}
      >
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          {...inputProps}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
          accessibilityLabel={label}
          onChangeText={(text) => {
            markActivity(); // typing counts as activity for the inactivity timer
            inputProps.onChangeText?.(text);
          }}
          secureTextEntry={secret && !revealed}
          // Keep secrets out of keyboard suggestions and autofill.
          autoComplete={secret ? 'off' : inputProps.autoComplete}
          importantForAutofill={secret ? 'no' : inputProps.importantForAutofill}
          placeholderTextColor={colors.textMuted}
          style={[
            typography.body,
            styles.input,
            inputProps.multiline ? styles.multiline : null,
            { color: colors.text },
          ]}
        />
        {secret ? (
          <EyeButton
            revealed={revealed}
            accessibilityLabel={`${revealed ? 'Hide' : 'Show'} ${label}`}
            onPress={() => setRevealed((v) => !v)}
          />
        ) : null}
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={[typography.caption, { color: colors.danger }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // No outline: only the line under the field has a width.
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 2, minHeight: 48 },
  input: { flex: 1, paddingVertical: 8 },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
});
