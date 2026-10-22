import { TextInput, View } from 'react-native';

import { useTheme } from '@/theme';
import { markActivity } from '@/utils/activity';

type Props = { value: string; onChangeText: (text: string) => void; placeholder: string };

// A compact search box with a magnifier. The label is for screen readers only.
export function SearchBar({ value, onChangeText, placeholder }: Props) {
  const { colors, radius, spacing, typography } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        minHeight: 48,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.outline,
        backgroundColor: colors.surface,
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
            borderColor: colors.textMuted,
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
            backgroundColor: colors.textMuted,
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
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        importantForAutofill="no"
        style={[typography.body, { flex: 1, color: colors.text, paddingVertical: 8 }]}
      />
    </View>
  );
}
