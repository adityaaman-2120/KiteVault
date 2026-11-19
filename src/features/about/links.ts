import { Alert, Linking } from 'react-native';

// Links the user can tap. They open in the phone's browser or mail app; KiteVault itself makes no
// network request for them.
export const PRIVACY_URL = 'https://kitelux.com/vault/privacy/';
export const TERMS_URL = 'https://kitelux.com/vault/terms/';
export const KITELUX_URL = 'https://kitelux.com/';
export const SUPPORT_EMAIL = 'support@kitelux.com';

export async function openLink(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Cannot open', `No app on this phone could open ${url.replace(/^mailto:/, '')}.`);
  }
}
