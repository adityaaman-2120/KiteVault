import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { useTheme } from '@/theme';
import { markActivity } from '@/utils/activity';

type Props = { value: string; onChangeText: (text: string) => void; placeholder: string };

// The search box on the dark header. It has the same shape as every other place you type (a
// filled rectangle, no outline, a line under it that lights up), with a light wash for the
// fill because the header is dark. The label is for screen readers only.
export function SearchBar({ value, onChangeText, placeholder }: Props) {
  const { colors, radius, spacing, typography } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        minHeight: 48,
        paddingHorizontal: spacing.md,
        borderTopLeftRadius: radius.sm,
        borderTopRightRadius: radius.sm,
        borderBottomWidth: 2,
        borderBottomColor: focused ? '#FFB547' : 'transparent',
        backgroundColor: 'rgba(255,255,255,0.12)',
      }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ width: 18, height: 18 }}
      >
        <View
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: colors.onHeader,
            opacity: 0.7,
          }}
        />
        <View
          style={{
            position: 'absolute',
            right: 1,
            bottom: 3,
            width: 7,
            height: 2,
            borderRadius: 1,
            backgroundColor: colors.onHeader,
            opacity: 0.7,
            transform: [{ rotate: '45deg' }],
          }}
        />
      </View>
      <TextInput
        accessibilityLabel="Search"
        value={value}
        onChangeText={(text) => {
          markActivity(); // typing counts as activity for the inactivity timer
          onChangeText(text);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.6)"
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        importantForAutofill="no"
        style={[typography.body, { flex: 1, color: colors.onHeader, paddingVertical: 8 }]}
      />
    </View>
  );
}
