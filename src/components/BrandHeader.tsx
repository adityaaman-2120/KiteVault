import { Image, Text, View } from 'react-native';

import { useTheme } from '@/theme';

type Props = {
  // "large" for the welcome screen, "small" where space is tight.
  size?: 'large' | 'small';
};

// The logo, the name and "by Kitelux". The picture is decoration: the text says it all.
export function BrandHeader({ size = 'small' }: Props) {
  const { colors, spacing, typography } = useTheme();
  const mark = size === 'large' ? 72 : 48;

  return (
    <View
      accessible
      accessibilityLabel="KiteVault by Kitelux"
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
    >
      <Image
        source={require('../../assets/images/brand-mark.png')}
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={{ width: mark, height: mark }}
        resizeMode="contain"
      />
      <View>
        <Text
          maxFontSizeMultiplier={1.5}
          style={[size === 'large' ? typography.title : typography.heading, { color: colors.text }]}
        >
          Kite<Text style={{ color: colors.accent }}>Vault</Text>
        </Text>
        <Text maxFontSizeMultiplier={1.5} style={[typography.caption, { color: colors.textMuted }]}>
          by Kitelux
        </Text>
      </View>
    </View>
  );
}
