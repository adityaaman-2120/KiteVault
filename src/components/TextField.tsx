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
  // The form look: a darker rectangle that never changes, and a line under it that lights up
  // while you type.
  plain?: boolean;
};

export function TextField({ label, secret = false, error, plain = false, ...inputProps }: Props) {
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
            backgroundColor: plain ? colors.field : colors.surface,
            borderColor: plain
              ? underline
              : error
                ? colors.danger
                : focused
                  ? colors.primary
                  : colors.outline,
            // The form look has no outline: only the line under the field, which lights up on focus.
            borderWidth: plain ? 0 : focused ? 2 : 1,
            borderBottomWidth: plain ? 2 : focused ? 2 : 1,
            borderTopLeftRadius: plain ? radius.sm : radius.lg,
            borderTopRightRadius: plain ? radius.sm : radius.lg,
            borderBottomLeftRadius: plain ? 0 : radius.lg,
            borderBottomRightRadius: plain ? 0 : radius.lg,
            paddingHorizontal: plain ? spacing.md : spacing.lg,
            minHeight: plain ? 48 : 52,
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
            plain ? styles.inputPlain : null,
            inputProps.multiline ? (plain ? styles.multilinePlain : styles.multiline) : null,
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
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, minHeight: 52 },
  input: { flex: 1, paddingVertical: 10 },
  inputPlain: { paddingVertical: 8 },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
  multilinePlain: { minHeight: 88, textAlignVertical: 'top' },
});
