import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { BrandHeader, Button, Card, ScreenContainer } from '@/components';
import { useTheme } from '@/theme';

import { KITELUX_URL, openLink, PRIVACY_URL, SUPPORT_EMAIL, TERMS_URL } from './links';

// What KiteVault itself promises. These are the app's promises, not the studio's: Kitelux has a
// website, KiteVault has no server at all.
export const OFFLINE_STATEMENT =
  'KiteVault works fully offline. There is no account, no sign-in and no server. It has no ads, no analytics and no tracking, and it never contacts Kitelux.';

export const PRIVACY_STATEMENT = [
  'Your passwords stay on this phone. They are encrypted with AES-256-GCM, using a key made from your master password with Argon2id. Kitelux never sees your master password or your data, and cannot recover them if you forget the password.',
  'KiteVault has no accounts, no analytics, no tracking and no ads.',
  'Only two optional features use the internet, and both are off until you turn them on: an encrypted backup to your own Google Drive (the backup is encrypted on your phone first), and the breach check, which sends only the first 5 characters of a password’s fingerprint, never the password.',
  'Files you export are yours to look after. A .kvault backup is encrypted; CSV and JSON exports are not.',
];

export const DEVELOPER_STATEMENT =
  'KiteVault is a product of Kitelux, an independent software studio in Kolkata, India. Kitelux is the trading name of Aditya Aman, an individual developer. Kitelux builds small, focused apps that respect your privacy and are honest about what they can and cannot protect.';

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
        <Text style={[typography.body, { color: colors.text }]}>{OFFLINE_STATEMENT}</Text>
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
        <Text style={[typography.heading, { color: colors.text }]}>Legal</Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>
          The full documents are on the Kitelux website. Tapping a button opens your browser, which
          needs internet. KiteVault itself stays offline.
        </Text>
        <Button
          title="Privacy Policy"
          variant="secondary"
          onPress={() => void openLink(PRIVACY_URL)}
        />
        <Button
          title="Terms of Service"
          variant="secondary"
          onPress={() => void openLink(TERMS_URL)}
        />
      </Card>

      <Card>
        <Text style={[typography.heading, { color: colors.text }]}>Contact</Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>
          Questions, problems or security reports: {SUPPORT_EMAIL}. Never send your master password
          or any vault contents; nobody at Kitelux can use them, and nobody should ask for them.
        </Text>
        <Button
          title="Email support"
          variant="secondary"
          onPress={() => void openLink(`mailto:${SUPPORT_EMAIL}`)}
        />
      </Card>

      <Card>
        <Text style={[typography.heading, { color: colors.text }]}>About the developer</Text>
        <Text style={[typography.body, { color: colors.text }]}>{DEVELOPER_STATEMENT}</Text>
        <Button
          title="Kitelux website"
          variant="secondary"
          onPress={() => void openLink(KITELUX_URL)}
        />
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
