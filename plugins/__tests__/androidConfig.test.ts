import * as fs from 'node:fs';
import * as path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require('../withNoBackup');

const root = path.resolve(__dirname, '..', '..');
const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')) as {
  expo: { android: Record<string, unknown>; plugins: unknown[] };
};

describe('backup protection (app.json + config plugin)', () => {
  test('android.allowBackup is false', () => {
    expect(appJson.expo.android.allowBackup).toBe(false);
  });

  test('the no-backup plugin is registered', () => {
    expect(appJson.expo.plugins).toContain('./plugins/withNoBackup');
  });

  test('the plugin writes all three manifest attributes', () => {
    const application: { $: Record<string, string> } = { $: { 'android:allowBackup': 'true' } };
    plugin.setBackupAttributes(application);
    expect(application.$).toEqual({
      'android:allowBackup': 'false',
      'android:fullBackupContent': '@xml/kitevault_backup_rules',
      'android:dataExtractionRules': '@xml/kitevault_data_extraction_rules',
    });
  });

  const domains = (xml: string, section: string) => {
    const block = xml.match(new RegExp(`<${section}>([\\s\\S]*?)</${section}>`))?.[1] ?? '';
    return [...block.matchAll(/<exclude domain="(\w+)" path="\." \/>/g)].map((m) => m[1]);
  };

  test('data extraction rules exclude every area from cloud backup and device transfer', () => {
    const xml: string = plugin.DATA_EXTRACTION_RULES_XML;
    const all = [
      'root',
      'file',
      'database',
      'sharedpref',
      'external',
      'device_root',
      'device_file',
      'device_database',
      'device_sharedpref',
    ];
    expect(domains(xml, 'cloud-backup').sort()).toEqual([...all].sort());
    expect(domains(xml, 'device-transfer').sort()).toEqual([...all].sort());
    expect(xml).not.toMatch(/<include/);
  });

  test('the Android 11 and older rules exclude everything too', () => {
    const xml: string = plugin.FULL_BACKUP_CONTENT_XML;
    expect(domains(xml, 'full-backup-content').sort()).toEqual(
      ['database', 'external', 'file', 'root', 'sharedpref'].sort(),
    );
    expect(xml).not.toMatch(/<include/);
  });
});
