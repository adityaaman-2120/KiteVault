// Expo config plugin for the optional Google Drive backup.
//
// Why our own plugin: @react-native-google-signin/google-signin ships a plugin, but on Android
// it only does something when a Firebase google-services.json is used, and otherwise wants an
// iOS URL scheme. KiteVault is Android-only and does not use Firebase, so that plugin would do
// nothing here. The Android side needs no native changes (the library is linked automatically);
// what it needs is to be switched on deliberately and, optionally, to know a Web client ID.
//
// Options (in app.json, "plugins"):
//   enabled      false (default): the app has no cloud backup at all, no sign-in screen, no
//                network code path. Set to true only after the Google Cloud setup is done.
//   webClientId  OPTIONAL. Only needed if Google sign-in asks for an ID token, which this app
//                does not use. Checked for the right shape so a typo fails the build, not the user.
const { createRunOncePlugin } = require('expo/config-plugins');

const WEB_CLIENT_ID = /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/;

function normalizeOptions(options) {
  const { enabled = false, webClientId = '' } = options ?? {};
  if (typeof enabled !== 'boolean') {
    throw new Error('withGoogleBackup: "enabled" must be true or false.');
  }
  if (webClientId !== '' && !WEB_CLIENT_ID.test(webClientId)) {
    throw new Error(
      'withGoogleBackup: "webClientId" must look like 1234567890-abc123.apps.googleusercontent.com',
    );
  }
  return { enabled, webClientId };
}

function withGoogleBackup(config, options) {
  const cloudBackup = normalizeOptions(options);
  return { ...config, extra: { ...config.extra, cloudBackup } };
}

const plugin = createRunOncePlugin(withGoogleBackup, 'kitevault-google-backup', '1.0.0');

module.exports = plugin;
module.exports.normalizeOptions = normalizeOptions;
module.exports.WEB_CLIENT_ID = WEB_CLIENT_ID;
