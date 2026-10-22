import fs from 'fs';
import path from 'path';

import { redirectSystemPath } from '../app/+native-intent';

// Checks written after the security review (docs/SECURITY_REVIEW.md). They read the source and the
// app configuration so that a rule fixed once cannot quietly come back. They prove the absence of
// specific mistakes; they do not prove the app is secure.
const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src');

function sourceFiles(dir: string, extensions: string[]): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'build', '__tests__', '__support__', '.gradle'].includes(entry.name))
        return [];
      return sourceFiles(full, extensions);
    }
    return extensions.some((e) => entry.name.endsWith(e)) ? [full] : [];
  });
}

// Comments may mention these words; only code counts.
const code = (file: string) =>
  fs
    .readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const appFiles = sourceFiles(SRC, ['.ts', '.tsx']).filter(
  (f) => !f.endsWith('licenses.generated.ts'),
);
const offenders = (pattern: RegExp) =>
  appFiles.filter((f) => pattern.test(code(f))).map((f) => path.relative(ROOT, f));

describe('the app code', () => {
  test('finds the source files', () => {
    expect(appFiles.length).toBeGreaterThan(100);
  });

  test('never uses Math.random (CLAUDE.md rule 5)', () => {
    expect(offenders(/Math\.random\s*\(/)).toEqual([]);
  });

  test('never logs (CLAUDE.md rule 2)', () => {
    expect(offenders(/\bconsole\.(log|warn|error|info|debug|trace|dir)\s*\(/)).toEqual([]);
  });

  test('has no analytics, crash reporting or tracking library', () => {
    expect(
      offenders(/Sentry|Crashlytics|firebase|amplitude|mixpanel|segment\.io|bugsnag|datadog/i),
    ).toEqual([]);
  });

  test('keeps no secrets in general-purpose storage', () => {
    expect(
      offenders(/AsyncStorage|SecureStore|localStorage|sessionStorage|MMKV|expo-sqlite/),
    ).toEqual([]);
  });

  test('never leaves a file with secrets in the cache by using the "print to file" or photo APIs', () => {
    expect(offenders(/printToFileAsync|takePictureAsync|recordAsync|launchCameraAsync/)).toEqual(
      [],
    );
  });

  test('does not turn its own error text into a place for secrets', () => {
    // An error message built from a variable could carry a password into a crash log.
    expect(
      offenders(
        /new (Error|VaultError|BackupError|CryptoError|StorageError|ImportError)\(\s*`[^`]*\$\{/,
      ),
    ).toEqual([]);
  });

  test('talks to no server except the two the rules allow (CLAUDE.md rule 3)', () => {
    // Every web address written in the code (comments and the license texts are not code).
    const hosts = new Set<string>();
    for (const f of appFiles.filter((x) => !/extraLicenses|[\\/]seed\.ts$/.test(x))) {
      for (const m of code(f).matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
        hosts.add(m[1]!.toLowerCase());
      }
    }
    const allowed = new Set([
      'www.googleapis.com', // the optional Google Drive backup
      'api.pwnedpasswords.com', // the optional breach check
    ]);
    // Addresses that are only examples in the user interface or that are links the user opens.
    const harmless = [...hosts].filter((h) => !allowed.has(h));
    const links =
      /^(www\.)?(eff\.org|creativecommons\.org|kitelux\.|example\.|github\.com|publicsuffix\.org|mozilla\.org)/;
    expect(harmless.filter((h) => !links.test(h))).toEqual([]);
    for (const host of allowed) expect(hosts.has(host)).toBe(true);
  });

  test('opens only http(s) addresses from saved entries', () => {
    const format = fs.readFileSync(path.join(SRC, 'features/entries/format.ts'), 'utf8');
    expect(format).toContain('so we never hand javascript:, intent: or file: links to the system');
  });
});

describe('app configuration', () => {
  const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')) as {
    expo: {
      android: { allowBackup: boolean; blockedPermissions: string[]; permissions?: string[] };
      plugins: unknown[];
    };
  };
  const { android } = appJson.expo;

  test('keeps Android backup off (CLAUDE.md rule 8)', () => {
    expect(android.allowBackup).toBe(false);
    expect(appJson.expo.plugins).toContain('./plugins/withNoBackup');
  });

  test('blocks permissions the app does not use', () => {
    expect(android.blockedPermissions).toEqual(
      expect.arrayContaining([
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.VIBRATE',
      ]),
    );
  });

  test('asks for no dangerous permission by itself', () => {
    const asked = JSON.stringify(android.permissions ?? []) + JSON.stringify(appJson.expo.plugins);
    for (const forbidden of [
      'RECORD_AUDIO',
      'QUERY_ALL_PACKAGES',
      'READ_CONTACTS',
      'ACCESS_FINE_LOCATION',
      'READ_SMS',
      'MANAGE_EXTERNAL_STORAGE',
    ]) {
      expect(asked).not.toContain(forbidden);
    }
  });

  test('the camera plugin asks for the camera only (no microphone)', () => {
    const camera = appJson.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-camera') as [
      string,
      Record<string, unknown>,
    ];
    expect(camera[1]).toMatchObject({ microphonePermission: false, recordAudioAndroid: false });
  });
});

describe('links and intents from outside the app', () => {
  test.each([
    ['kitevault://export', false],
    ['kitevault://entry/abc', false],
    ['/export', true],
    ['/autofill-save', false],
    ['exp+kitevault://expo-development-client/?url=http%3A%2F%2Fevil.test', true],
    ['https://evil.test/restore', false],
    ['', true],
    ['javascript:alert(1)', false],
  ])('%s only opens the app normally', (incoming, initial) => {
    expect(redirectSystemPath({ path: incoming, initial })).toBe('/');
  });
});

describe('the Kotlin code', () => {
  const MAIN = path.join(
    ROOT,
    'src/native/keystore/android/src/main/java/expo/modules/kitevaultkeystore',
  );

  test("autofill ignores KiteVault's own screens, for filling and for saving", () => {
    const service = code(path.join(MAIN, 'autofill/KiteVaultAutofillService.kt'));
    expect(service.match(/ownerPackage == packageName/g)).toHaveLength(2);
  });

  test('app names shown in prompts are cleaned first', () => {
    const identity = code(path.join(MAIN, 'autofill/AppIdentity.kt'));
    expect(identity).toContain('LabelSanitizer.clean(');
  });

  test('copied secrets are marked sensitive for Android 13+', () => {
    const clip = code(path.join(MAIN, 'ClipboardModule.kt'));
    expect(clip).toContain('android.content.extra.IS_SENSITIVE');
    expect(clip).not.toMatch(/\bLog\./);
  });
});
