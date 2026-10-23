import * as fs from 'node:fs';
import * as path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require('../withAutofill');

const root = path.resolve(__dirname, '..', '..');
const moduleDir = path.join(root, 'src/native/keystore/android/src/main');

type Item = { $: Record<string, string>; [key: string]: unknown };
type Manifest = { application: { service?: Item[]; activity?: Item[] }[]; queries?: unknown[] };

const emptyManifest = (): Manifest => ({
  application: [{ activity: [{ $: { 'android:name': '.MainActivity' } }] }],
});

const find = (list: Item[] | undefined, name: string) =>
  list?.find((item) => item.$['android:name'] === name);

describe('the autofill service entry', () => {
  const manifest = plugin.applyAutofillManifest(emptyManifest()) as Manifest;
  const service = find(manifest.application[0]!.service, plugin.SERVICE)!;

  test('is protected so only the Android system can connect to it', () => {
    expect(service.$['android:permission']).toBe('android.permission.BIND_AUTOFILL_SERVICE');
    expect(service.$['android:exported']).toBe('true');
  });

  test('has the intent filter Android looks for, and its settings file', () => {
    expect(JSON.stringify(service['intent-filter'])).toContain(
      'android.service.autofill.AutofillService',
    );
    expect(JSON.stringify(service['meta-data'])).toContain('"android:name":"android.autofill"');
    expect(JSON.stringify(service['meta-data'])).toContain('@xml/kitevault_autofill_service');
  });

  test('points at a class that exists in the Kotlin module', () => {
    const file = plugin.SERVICE.replace('expo.modules.kitevaultkeystore.', '').replace(/\./g, '/');
    const kotlin = path.join(moduleDir, 'java/expo/modules/kitevaultkeystore', `${file}.kt`);
    expect(fs.existsSync(kotlin)).toBe(true);
  });
});

describe('the unlock screen entry', () => {
  const manifest = plugin.applyAutofillManifest(emptyManifest()) as Manifest;
  const activity = find(manifest.application[0]!.activity, plugin.ACTIVITY)!;

  test('cannot be started by other apps and is kept out of the recent-apps list', () => {
    expect(activity.$['android:exported']).toBe('false');
    expect(activity.$['android:excludeFromRecents']).toBe('true');
    expect(activity.$['android:noHistory']).toBe('true');
    expect(activity['intent-filter']).toBeUndefined();
  });

  test('uses a theme that exists in the module', () => {
    expect(activity.$['android:theme']).toBe('@style/KiteVaultAutofillTheme');
    const styles = fs.readFileSync(
      path.join(moduleDir, 'res/values/kitevault_autofill_styles.xml'),
      'utf8',
    );
    expect(styles).toContain('name="KiteVaultAutofillTheme"');
  });

  test('points at a class that exists in the Kotlin module', () => {
    const kotlin = path.join(
      moduleDir,
      'java/expo/modules/kitevaultkeystore/autofill/AutofillAuthActivity.kt',
    );
    expect(fs.existsSync(kotlin)).toBe(true);
  });
});

describe('the strong-password sheet entry', () => {
  const manifest = plugin.applyAutofillManifest(emptyManifest()) as Manifest;
  const activity = find(manifest.application[0]!.activity, plugin.SUGGEST_ACTIVITY)!;

  test('cannot be started by other apps and is kept out of the recent-apps list', () => {
    expect(activity).toBeDefined();
    expect(activity.$['android:exported']).toBe('false');
    expect(activity.$['android:excludeFromRecents']).toBe('true');
    expect(activity.$['android:noHistory']).toBe('true');
    expect(activity['intent-filter']).toBeUndefined();
  });

  test('uses the same see-through theme as the unlock screen', () => {
    expect(activity.$['android:theme']).toBe('@style/KiteVaultAutofillTheme');
  });

  test('points at a class that exists in the Kotlin module', () => {
    const kotlin = path.join(
      moduleDir,
      'java/expo/modules/kitevaultkeystore/autofill/AutofillSuggestActivity.kt',
    );
    expect(fs.existsSync(kotlin)).toBe(true);
  });
});

describe('the manifest as a whole', () => {
  test('keeps what was there and never adds a second copy when run twice', () => {
    const once = plugin.applyAutofillManifest(emptyManifest()) as Manifest;
    const twice = plugin.applyAutofillManifest(once) as Manifest;
    const app = twice.application[0]!;
    expect(app.service).toHaveLength(1);
    expect(app.activity!.filter((a) => a.$['android:name'] === plugin.ACTIVITY)).toHaveLength(1);
    expect(
      app.activity!.filter((a) => a.$['android:name'] === plugin.SUGGEST_ACTIVITY),
    ).toHaveLength(1);
    expect(find(app.activity, '.MainActivity')).toBeDefined();
    expect(twice.queries).toHaveLength(1);
  });

  test('asks to see launcher apps, not every app (no QUERY_ALL_PACKAGES)', () => {
    const manifest = plugin.applyAutofillManifest(emptyManifest()) as Manifest;
    expect(JSON.stringify(manifest.queries)).toContain('android.intent.category.LAUNCHER');
    expect(JSON.stringify(manifest)).not.toContain('QUERY_ALL_PACKAGES');
  });

  test('every resource the entries mention exists in the module', () => {
    expect(fs.existsSync(path.join(moduleDir, 'res/xml/kitevault_autofill_service.xml'))).toBe(
      true,
    );
    expect(
      fs.existsSync(path.join(moduleDir, 'res/layout/kitevault_autofill_locked_item.xml')),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(moduleDir, 'res/layout/kitevault_autofill_suggest_item.xml')),
    ).toBe(true);
  });

  test('is switched on in app.json, and the module declares its autofill class', () => {
    const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')) as {
      expo: { plugins: unknown[] };
    };
    expect(appJson.expo.plugins).toContain('./plugins/withAutofill');
    const moduleConfig = JSON.parse(
      fs.readFileSync(path.join(root, 'src/native/keystore/expo-module.config.json'), 'utf8'),
    ) as { android: { modules: string[] } };
    expect(moduleConfig.android.modules).toContain(
      'expo.modules.kitevaultkeystore.autofill.AutofillModule',
    );
  });
});
