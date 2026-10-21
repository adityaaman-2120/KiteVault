import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { Button, Card, ScreenContainer } from '@/components';
import { useTheme } from '@/theme';

export const PRIVACY_STATEMENT = [
  'Your passwords stay on this phone. They are encrypted with AES-256-GCM, using a key made from your master password with Argon2id. We never see your master password or your data, and we cannot recover them if you forget the password.',
  'KiteVault has no accounts, no analytics, no tracking and no ads.',
  'The only features that use the internet are optional ones that are off unless you turn them on: an encrypted backup to your own Google Drive, and a check of your passwords against known data breaches. Neither is available in this version.',
];

export function appVersion(): string {
  return Constants.expoConfig?.version ?? 'unknown';
}

export function AboutScreen() {
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();

  return (
    <ScreenContainer scroll>
      <View style={{ gap: spacing.xs }}>
        <Text style={[typography.title, { color: colors.text }]}>KiteVault</Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>by Kitelux</Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>Version {appVersion()}</Text>
      </View>

      <Card>
        <Text style={[typography.heading, { color: colors.text }]}>Privacy</Text>
        {PRIVACY_STATEMENT.map((paragraph) => (
          <Text key={paragraph} style={[typography.body, { color: colors.text }]}>
            {paragraph}
          </Text>
        ))}
      </Card>

      <Card>
        <Text style={[typography.heading, { color: colors.text }]}>Open source</Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>
          KiteVault is built with open source software. See the licenses of the libraries it uses.
        </Text>
        <Button
          title="Open source licenses"
          variant="secondary"
          onPress={() => router.push('/licenses')}
        />
      </Card>
    </ScreenContainer>
  );
}
