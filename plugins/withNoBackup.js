// Expo config plugin: keeps ALL KiteVault data out of Android cloud backup and device-to-device
// transfer, in addition to android.allowBackup = false (set in app.json).
//
// Why three things: allowBackup="false" is the switch every Android version understands.
// android:dataExtractionRules is the Android 12+ (API 31+) rule file, and
// android:fullBackupContent is the Android 11 and older one. Listing every storage area as
// excluded means the data stays out even if allowBackup were ever flipped by mistake.
const fs = require('fs');
const path = require('path');
const {
  createRunOncePlugin,
  withAndroidManifest,
  withDangerousMod,
} = require('expo/config-plugins');

const RULES_FILE = 'kitevault_data_extraction_rules';
const FULL_BACKUP_FILE = 'kitevault_backup_rules';

// Every storage area an app can have, normal and device-protected.
const CLOUD_DOMAINS = ['root', 'file', 'database', 'sharedpref', 'external'];
const DEVICE_DOMAINS = ['device_root', 'device_file', 'device_database', 'device_sharedpref'];

const exclude = (domain) => `    <exclude domain="${domain}" path="." />`;

const DATA_EXTRACTION_RULES_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- Android 12+: nothing from KiteVault goes to cloud backup or to a new phone. -->
<data-extraction-rules>
  <cloud-backup>
${[...CLOUD_DOMAINS, ...DEVICE_DOMAINS].map(exclude).join('\n')}
  </cloud-backup>
  <device-transfer>
${[...CLOUD_DOMAINS, ...DEVICE_DOMAINS].map(exclude).join('\n')}
  </device-transfer>
</data-extraction-rules>
`;

const FULL_BACKUP_CONTENT_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- Android 11 and older: nothing from KiteVault goes to backup. -->
<full-backup-content>
${CLOUD_DOMAINS.map(exclude).join('\n')}
</full-backup-content>
`;

function setBackupAttributes(application) {
  application.$['android:allowBackup'] = 'false';
  application.$['android:fullBackupContent'] = `@xml/${FULL_BACKUP_FILE}`;
  application.$['android:dataExtractionRules'] = `@xml/${RULES_FILE}`;
}

function withNoBackup(config) {
  config = withAndroidManifest(config, (cfg) => {
    setBackupAttributes(cfg.modResults.manifest.application[0]);
    return cfg;
  });

  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${RULES_FILE}.xml`), DATA_EXTRACTION_RULES_XML);
      fs.writeFileSync(path.join(dir, `${FULL_BACKUP_FILE}.xml`), FULL_BACKUP_CONTENT_XML);
      return cfg;
    },
  ]);
}

const plugin = createRunOncePlugin(withNoBackup, 'kitevault-no-backup', '1.0.0');

module.exports = plugin;
module.exports.DATA_EXTRACTION_RULES_XML = DATA_EXTRACTION_RULES_XML;
module.exports.FULL_BACKUP_CONTENT_XML = FULL_BACKUP_CONTENT_XML;
module.exports.setBackupAttributes = setBackupAttributes;
