import { Switch, Text, View } from 'react-native';

import { useTheme } from '@/theme';

type Props = {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
};

export function ToggleRow({ label, description, value, onChange }: Props) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[typography.body, { color: colors.text, fontWeight: '600' }]}>{label}</Text>
        {description ? (
          <Text style={[typography.caption, { color: colors.textMuted }]}>{description}</Text>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.primary, false: colors.outline }}
        thumbColor={value ? colors.onPrimary : colors.surface}
      />
    </View>
  );
}
