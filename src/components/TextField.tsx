import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme';

import { TextAction } from './TextAction';
import { markActivity } from '@/utils/activity';

type Props = Omit<TextInputProps, 'style' | 'secureTextEntry'> & {
  label: string;
  // Validation message shown under the field.
  error?: string;
  // Hides the text by default and adds a show/hide toggle.
  secret?: boolean;
};

export function TextField({ label, secret = false, error, ...inputProps }: Props) {
  const { colors, radius, spacing, typography } = useTheme();
  const [revealed, setRevealed] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[typography.label, { color: focused ? colors.primary : colors.textMuted }]}>
        {label}
      </Text>
      <View
        style={[
          styles.row,
          {
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : focused ? colors.primary : colors.outline,
            borderWidth: focused ? 2 : 1,
            borderRadius: radius.lg,
            paddingHorizontal: spacing.lg,
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
          <TextAction
            label={revealed ? 'Hide' : 'Show'}
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
  multiline: { minHeight: 110, textAlignVertical: 'top' },
});
