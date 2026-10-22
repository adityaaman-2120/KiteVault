import fs from 'fs';
import path from 'path';

import { createVault, getVaultKeyCopy, readBackupData, saveVault } from '..';
import {
  FAST_KDF,
  makeEntry,
  resetVaultFiles,
  snapshot,
  vaultFile,
} from '../__support__/testUtils';
import type { VaultData } from '..';

// The Kotlin autofill code reads the same vault file as the app. This test makes (or checks) a
// small real vault file that BOTH sides must be able to open, so a change to the file format
// breaks a test instead of breaking autofill silently.
//
// To regenerate the fixture:  WRITE_AUTOFILL_FIXTURE=1 npx jest src/vault/__tests__/autofillFixture
const DIR = path.join(__dirname, '../../native/keystore/android/src/test/resources');
const FILE = path.join(DIR, 'vault-fixture.kvlt');
const META = path.join(DIR, 'vault-fixture.json');
const PASSWORD = 'fixture password for tests only';

const login = (id: string, over: Record<string, unknown>) => ({
  ...makeEntry({ id, totpSecret: undefined, customFields: [], passwordHistory: [] }),
  ...over,
});

function fixtureData(base: VaultData): VaultData {
  const entries = [
    login('github', {
      title: 'GitHub',
      username: 'octocat',
      password: 'gh-pass-1',
      urls: ['https://github.com/login', 'http://www.github.com'],
      futureField: { ignored: true },
    }),
    login('app', {
      title: 'Example App',
      username: 'appuser',
      password: 'app-pass',
      urls: [],
      appLinks: [{ packageName: 'com.example.app', certSha256: 'AA:BB:CC:DD' }],
    }),
    login('mail', {
      title: 'Mail',
      username: 'me',
      password: 'mail-pass',
      urls: ['https://mail.example.com'],
    }),
    login('trashed', {
      title: 'Old',
      username: 'old',
      password: 'old-pass',
      urls: ['https://old.example'],
      deletedAt: 5,
    }),
    login('note', {
      type: 'note',
      title: 'A note',
      username: '',
      password: '',
      urls: [],
      notes: 'secret note',
    }),
    login('card', { type: 'card', title: 'Visa', username: '', password: '', urls: [] }),
    login('unicode', {
      title: 'Café ünïcode',
      username: 'user@bücher.example',
      password: 'pässwörd-🔑',
      urls: ['https://bücher.example'],
    }),
    login('androidapp', {
      title: 'Imported app',
      username: 'x',
      password: 'y',
      urls: ['androidapp://com.example.app'],
    }),
  ];
  return { ...base, entries: entries as VaultData['entries'] };
}

afterAll(() => resetVaultFiles());

test('the fixture for the Kotlin tests is a real vault that the app code can open', async () => {
  if (process.env.WRITE_AUTOFILL_FIXTURE === '1') {
    resetVaultFiles();
    const created = await createVault(PASSWORD, { kdfParams: FAST_KDF });
    await saveVault(snapshot(fixtureData(created)));
    const key = getVaultKeyCopy();
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, Buffer.from(await vaultFile().bytes()));
    fs.writeFileSync(
      META,
      JSON.stringify({ password: PASSWORD, keyHex: Buffer.from(key).toString('hex') }, null, 2) +
        '\n',
    );
    key.fill(0);
  }

  const bytes = Uint8Array.from(fs.readFileSync(FILE));
  const data = await readBackupData(bytes, PASSWORD);
  expect(data.entries.map((e) => e.id)).toEqual([
    'github',
    'app',
    'mail',
    'trashed',
    'note',
    'card',
    'unicode',
    'androidapp',
  ]);
  expect(data.entries[6]!.password).toBe('pässwörd-🔑');

  const meta = JSON.parse(fs.readFileSync(META, 'utf8')) as { keyHex: string };
  expect(meta.keyHex).toMatch(/^[0-9a-f]{64}$/);
});
