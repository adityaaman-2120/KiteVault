import { Text, type TextStyle } from 'react-native';

import { useTheme } from '@/theme';

import { openLink, PRIVACY_URL, TERMS_URL } from './links';

// "By creating a vault you agree to ..." with both documents one tap away. They open in the
// browser, so reading them needs internet; the app itself stays offline.
export function LegalLinks() {
  const { colors, typography } = useTheme();
  const link: TextStyle[] = [
    typography.caption,
    { color: colors.primary, textDecorationLine: 'underline' },
  ];
  return (
    <Text style={[typography.caption, { color: colors.textMuted }]}>
      By creating a vault you agree to the{' '}
      <Text accessibilityRole="link" style={link} onPress={() => void openLink(TERMS_URL)}>
        Terms of Service
      </Text>{' '}
      and the{' '}
      <Text accessibilityRole="link" style={link} onPress={() => void openLink(PRIVACY_URL)}>
        Privacy Policy
      </Text>
      .
    </Text>
  );
}
