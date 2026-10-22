import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { BrandHeader, Button, Card, ScreenContainer } from '@/components';
import { useTheme } from '@/theme';

export const PRIVACY_STATEMENT = [
  'Your passwords stay on this phone. They are encrypted with AES-256-GCM, using a key made from your master password with Argon2id. Kitelux never sees your master password or your data, and cannot recover them if you forget the password.',
  'KiteVault has no accounts, no analytics, no tracking and no ads.',
  'Only two optional features use the internet, and both are off until you turn them on: an encrypted backup to your own Google Drive (the backup is encrypted on your phone first), and the breach check, which sends only the first 5 characters of a password’s fingerprint, never the password.',
];

export function appVersion(): string {
  return Constants.expoConfig?.version ?? 'unknown';
}

export function AboutScreen() {
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();

  return (
    <ScreenContainer scroll>
      <View style={{ gap: spacing.sm }}>
        <BrandHeader size="large" />
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
