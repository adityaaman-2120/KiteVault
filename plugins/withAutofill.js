// Expo config plugin: registers KiteVault's autofill service in AndroidManifest.xml.
//
// What it adds to the app's manifest:
//   * <service> KiteVaultAutofillService   - the thing Android talks to when a login box is tapped.
//       - permission BIND_AUTOFILL_SERVICE: only the Android system itself may connect to it.
//       - intent filter android.service.autofill.AutofillService: how Android finds autofill services.
//       - meta-data android.autofill -> @xml/kitevault_autofill_service (its small settings file).
//   * <activity> AutofillAuthActivity     - the unlock-and-choose screen. NOT exported, so no other
//       app can start it; hidden from the recent-apps list.
//   * <activity> AutofillSuggestActivity  - the "Use strong password?" sheet on sign-up pages. The
//       same protections as the unlock screen.
//   * <queries> for launcher apps          - since Android 11 an app cannot see which other apps
//       are installed unless it asks. Autofill must read the signing certificate of the app it is
//       filling (to tell a real app from a copy), so it asks to see apps that have a launcher icon.
//       This is the narrow alternative to the broad QUERY_ALL_PACKAGES permission.
//
// Where the Kotlin code is: NOT copied by this plugin. The classes live in the local Expo module
// src/native/keystore (package expo.modules.kitevaultkeystore.autofill), which Expo links into the
// app automatically (see "nativeModulesDir" in package.json). Copying the files a second time would
// give the build two copies of every class. The resources (@xml/..., @style/..., the layout) live
// in that module's res folder and are merged into the app the same way. This plugin only declares
// to Android which of those classes are the service and the screen.
const { createRunOncePlugin, withAndroidManifest } = require('expo/config-plugins');

const PACKAGE = 'expo.modules.kitevaultkeystore.autofill';
const SERVICE = `${PACKAGE}.KiteVaultAutofillService`;
const ACTIVITY = `${PACKAGE}.AutofillAuthActivity`;
const SUGGEST_ACTIVITY = `${PACKAGE}.AutofillSuggestActivity`;

const CONFIG_CHANGES =
  'orientation|screenSize|smallestScreenSize|screenLayout|keyboardHidden|uiMode';

const serviceElement = () => ({
  $: {
    'android:name': SERVICE,
    'android:label': 'KiteVault',
    'android:permission': 'android.permission.BIND_AUTOFILL_SERVICE',
    'android:exported': 'true',
  },
  'intent-filter': [
    { action: [{ $: { 'android:name': 'android.service.autofill.AutofillService' } }] },
  ],
  'meta-data': [
    {
      $: {
        'android:name': 'android.autofill',
        'android:resource': '@xml/kitevault_autofill_service',
      },
    },
  ],
});

const activityElement = (name) => ({
  $: {
    'android:name': name,
    'android:exported': 'false',
    'android:theme': '@style/KiteVaultAutofillTheme',
    'android:excludeFromRecents': 'true',
    'android:noHistory': 'true',
    'android:taskAffinity': '',
    'android:configChanges': CONFIG_CHANGES,
    'android:windowSoftInputMode': 'adjustResize',
  },
});

const launcherQuery = () => ({
  intent: [
    {
      action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
      category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
    },
  ],
});

const withoutName = (list, name) => (list ?? []).filter((item) => item.$['android:name'] !== name);

const hasLauncherQuery = (queries) =>
  (queries ?? []).some((q) =>
    (q.intent ?? []).some(
      (i) =>
        (i.action ?? []).some((a) => a.$['android:name'] === 'android.intent.action.MAIN') &&
        (i.category ?? []).some((c) => c.$['android:name'] === 'android.intent.category.LAUNCHER'),
    ),
  );

// Pure function on the parsed manifest, so it can be unit tested. Safe to run twice: it replaces
// its own entries instead of adding a second copy.
function applyAutofillManifest(manifest) {
  const application = manifest.application[0];
  application.service = [...withoutName(application.service, SERVICE), serviceElement()];
  application.activity = [
    ...withoutName(withoutName(application.activity, ACTIVITY), SUGGEST_ACTIVITY),
    activityElement(ACTIVITY),
    activityElement(SUGGEST_ACTIVITY),
  ];
  if (!hasLauncherQuery(manifest.queries)) {
    manifest.queries = [...(manifest.queries ?? []), launcherQuery()];
  }
  return manifest;
}

function withAutofill(config) {
  return withAndroidManifest(config, (cfg) => {
    applyAutofillManifest(cfg.modResults.manifest);
    return cfg;
  });
}

const plugin = createRunOncePlugin(withAutofill, 'kitevault-autofill', '1.0.0');

module.exports = plugin;
module.exports.applyAutofillManifest = applyAutofillManifest;
module.exports.SERVICE = SERVICE;
module.exports.ACTIVITY = ACTIVITY;
module.exports.SUGGEST_ACTIVITY = SUGGEST_ACTIVITY;
