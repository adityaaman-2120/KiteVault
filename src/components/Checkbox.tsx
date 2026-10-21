import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/theme';

type Props = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

export function Checkbox({ label, checked, onChange, disabled = false }: Props) {
  const { colors, radius, spacing, typography } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: radius.sm,
          borderWidth: 2,
          borderColor: checked ? colors.primary : colors.textMuted,
          backgroundColor: checked ? colors.primary : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? <Text style={{ color: colors.onPrimary, fontWeight: '700' }}>✓</Text> : null}
      </View>
      <Text style={[typography.body, { flex: 1, color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}
