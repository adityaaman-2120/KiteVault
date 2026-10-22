// Expo config plugin: switches off the way Google's ML Kit would send usage data.
//
// Why this exists: QR scanning for 2FA codes (expo-camera) pulls in Google's ML Kit. Google's own
// disclosure says ML Kit SDKs may send technical and performance data (device and app details,
// event types, timings, errors) to Google, and there is no supported setting to turn that off. It
// travels through Google's "Data Transport" library. KiteVault promises no analytics and no network
// calls except the optional Drive backup and breach check (CLAUDE.md rule 3), so this is not
// acceptable.
//
// What it does: removes the one component that tells Data Transport WHICH servers it may send to
// (TransportBackendDiscovery). With no destination registered, the library has nowhere to deliver
// an event and drops it. The scanner itself does not depend on it.
//
// NOT VERIFIED ON A DEVICE: that QR scanning still works with this removed, and that nothing is
// sent. docs/SECURITY_REVIEW.md lists how to check both. If scanning breaks, remove this plugin
// from app.json and decide between the alternatives listed there.
const { createRunOncePlugin, withAndroidManifest } = require('expo/config-plugins');

const REMOVED = ['com.google.android.datatransport.runtime.backends.TransportBackendDiscovery'];

const TOOLS = 'http://schemas.android.com/tools';

// Pure function on the parsed manifest, so it can be unit tested. Safe to run twice.
function removeTelemetryComponents(manifest) {
  manifest.$ = { ...manifest.$, 'xmlns:tools': TOOLS };
  const application = manifest.application[0];
  const services = (application.service ?? []).filter(
    (s) => !REMOVED.includes(s.$['android:name']),
  );
  for (const name of REMOVED) {
    services.push({ $: { 'android:name': name, 'tools:node': 'remove' } });
  }
  application.service = services;
  return manifest;
}

function withNoTelemetry(config) {
  return withAndroidManifest(config, (cfg) => {
    removeTelemetryComponents(cfg.modResults.manifest);
    return cfg;
  });
}

const plugin = createRunOncePlugin(withNoTelemetry, 'kitevault-no-telemetry', '1.0.0');

module.exports = plugin;
module.exports.removeTelemetryComponents = removeTelemetryComponents;
module.exports.REMOVED = REMOVED;
