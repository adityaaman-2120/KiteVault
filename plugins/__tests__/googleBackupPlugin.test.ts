import * as fs from 'node:fs';
import * as path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require('../withGoogleBackup');

const appJson = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', '..', 'app.json'), 'utf8'),
) as {
  expo: { plugins: unknown[]; extra?: unknown; platforms: string[] };
};

describe('options', () => {
  test('cloud backup is off unless it is switched on', () => {
    expect(plugin.normalizeOptions(undefined)).toEqual({ enabled: false, webClientId: '' });
    expect(plugin.normalizeOptions({})).toEqual({ enabled: false, webClientId: '' });
  });

  test('can be switched on, with or without a web client id', () => {
    expect(plugin.normalizeOptions({ enabled: true })).toEqual({ enabled: true, webClientId: '' });
    const id = '1234567890-abc123def456.apps.googleusercontent.com';
    expect(plugin.normalizeOptions({ enabled: true, webClientId: id })).toEqual({
      enabled: true,
      webClientId: id,
    });
  });

  test.each([
    'abc',
    '1234-xyz.example.com',
    ' 1-a.apps.googleusercontent.com',
    '1-a.apps.googleusercontent.com/',
  ])(
    'a mistyped web client id (%j) stops the build instead of failing later for the user',
    (webClientId) => {
      expect(() => plugin.normalizeOptions({ enabled: true, webClientId })).toThrow(/webClientId/);
    },
  );

  test('"enabled" must be true or false', () => {
    expect(() => plugin.normalizeOptions({ enabled: 'yes' })).toThrow(/enabled/);
  });
});

describe('the config it produces', () => {
  test('puts the settings where the app reads them and keeps everything else', () => {
    const config = plugin({ name: 'KiteVault', extra: { other: 1 } }, { enabled: true });
    expect(config.extra).toEqual({ other: 1, cloudBackup: { enabled: true, webClientId: '' } });
    expect(config.name).toBe('KiteVault');
  });

  test('is a no-op for native files: no manifest, Gradle or iOS changes are made', () => {
    const config = plugin({ name: 'KiteVault' }, { enabled: true });
    expect(
      Object.keys(config)
        .filter((key) => key !== '_internal')
        .sort(),
    ).toEqual(['extra', 'name']);
  });
});

describe('app.json', () => {
  test('uses this plugin, with valid options', () => {
    const entry = appJson.expo.plugins.find(
      (p) => Array.isArray(p) && p[0] === './plugins/withGoogleBackup',
    ) as [string, Record<string, unknown>] | undefined;
    expect(entry).toBeDefined();
    expect(() => plugin.normalizeOptions(entry![1])).not.toThrow();
  });

  test('does not use the library plugin, which would need Firebase files or an iOS scheme', () => {
    expect(JSON.stringify(appJson.expo.plugins)).not.toContain('@react-native-google-signin');
  });

  test('stays Android-only', () => {
    expect(appJson.expo.platforms).toEqual(['android']);
  });
});
