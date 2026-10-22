import { fireEvent, render, screen } from '@testing-library/react-native';
import fs from 'fs';
import path from 'path';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Linking } from 'react-native';

import { utf8Encode } from '@/crypto';
import { clearAttemptState } from '@/features/lock/unlockService';
import { loadVaultFile } from '@/storage';
import { createVault, isWellFormedVaultFile, saveVault, useVaultStore } from '@/vault';
import {
  FAST_KDF,
  makeEntry,
  resetVaultFiles,
  snapshot,
  vaultFile,
  withEntries,
} from '@/vault/__support__/testUtils';

import { exportEncrypted, exportPlainCsv, purgeExportFiles } from '../exportFiles';
import { ExportScreen } from '../ExportScreen';
import { classifyImport, pickImportFile, readKvault } from '../importFiles';
import { ImportScreen } from '../ImportScreen';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

const PASSWORD = 'correct horse battery staple';
const SECRET = 'hunter2-unique-marker';
const sample = (name: string) => fs.readFileSync(path.join(__dirname, 'samples', name));

const share = Sharing.shareAsync as jest.Mock;
const pick = DocumentPicker.getDocumentAsync as jest.Mock;
const exportDir = () => new Directory(Paths.cache, 'kitevault-exports');

type Shared = { name: string; bytes: Uint8Array; mimeType?: string };
let shared: Shared[];

async function setUpVault(entries = [makeEntry({ id: 'e1', password: SECRET })]) {
  resetVaultFiles();
  clearAttemptState();
  const created = await createVault(PASSWORD, { kdfParams: FAST_KDF });
  const data = snapshot({
    ...withEntries(created, ...entries),
    folders: [{ id: 'f1', name: 'Work' }],
  });
  useVaultStore.setState({ data: created });
  await saveVault(snapshot(data));
  useVaultStore.setState({ data });
}

// Makes the file the document picker will "choose".
async function choose(name: string, content: Uint8Array | string) {
  const file = new File(Paths.cache, `picked-${name}`);
  if (file.exists) file.delete();
  file.create();
  await file.write(content);
  pick.mockResolvedValueOnce({
    canceled: false,
    assets: [{ uri: file.uri, name, size: file.size }],
  });
  return file;
}

beforeEach(async () => {
  shared = [];
  share.mockReset();
  share.mockImplementation(async (uri: string, options?: { mimeType?: string }) => {
    const file = new File(uri);
    shared.push({ name: file.name, bytes: await file.bytes(), mimeType: options?.mimeType });
  });
  pick.mockReset();
  await setUpVault();
});
afterEach(() => {
  purgeExportFiles();
  jest.restoreAllMocks();
});
afterAll(() => resetVaultFiles());

describe('encrypted export (.kvault)', () => {
  test('a wrong master password shares nothing', async () => {
    await expect(exportEncrypted('wrong')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    expect(share).not.toHaveBeenCalled();
  });

  test('shares the vault file exactly as stored, and removes its temporary copy', async () => {
    await exportEncrypted(PASSWORD);
    expect(shared).toHaveLength(1);
    expect(shared[0]!.name).toMatch(/^KiteVault-\d{4}-\d{2}-\d{2}\.kvault$/);
    expect(shared[0]!.mimeType).toBe('application/octet-stream');
    expect(Uint8Array.from(shared[0]!.bytes)).toEqual(Uint8Array.from(await vaultFile().bytes()));
    expect(exportDir().exists).toBe(false);
  });

  test('nothing readable is in the exported file', async () => {
    await exportEncrypted(PASSWORD);
    const text = Buffer.from(shared[0]!.bytes).toString('latin1');
    for (const secret of [SECRET, PASSWORD, 'alice@example.com', 'Example Site']) {
      expect(text).not.toContain(secret);
    }
  });

  test('can be opened again with its password, but not with a wrong one', async () => {
    await exportEncrypted(PASSWORD);
    const classified = classifyImport(shared[0]!.bytes);
    expect(classified.kind).toBe('kvault');
    if (classified.kind !== 'kvault') return;
    await expect(readKvault(classified.bytes, 'wrong')).rejects.toMatchObject({
      code: 'WRONG_PASSWORD',
    });
    const parsed = await readKvault(classified.bytes, PASSWORD);
    expect(parsed.format).toBe('kvault');
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]).toMatchObject({ title: 'Example Site', password: SECRET });
    expect(parsed.entries[0]).not.toHaveProperty('id');
  });

  test('the temporary copy is removed even if sharing fails', async () => {
    share.mockRejectedValueOnce(new Error('share failed'));
    await expect(exportEncrypted(PASSWORD)).rejects.toThrow('share failed');
    expect(exportDir().exists).toBe(false);
  });

  test('says so when sharing is not available', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValueOnce(false);
    await expect(exportEncrypted(PASSWORD)).rejects.toMatchObject({ code: 'sharing-unavailable' });
  });
});

describe('plain CSV export', () => {
  test('a wrong master password writes and shares nothing', async () => {
    await expect(exportPlainCsv('wrong')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    expect(share).not.toHaveBeenCalled();
    expect(exportDir().exists).toBe(false);
  });

  test('shares a readable CSV and deletes its temporary copy', async () => {
    const count = await exportPlainCsv(PASSWORD);
    expect(count).toBe(1);
    expect(shared[0]!.name).toMatch(/^KiteVault-passwords-.*\.csv$/);
    expect(shared[0]!.mimeType).toBe('text/csv');
    const text = Buffer.from(shared[0]!.bytes).toString('utf8');
    expect(text).toContain(SECRET);
    expect(text.startsWith('folder,favorite,type,name')).toBe(true);
    expect(exportDir().exists).toBe(false);
  });

  test('the temporary CSV is removed even if sharing fails', async () => {
    share.mockRejectedValueOnce(new Error('share failed'));
    await expect(exportPlainCsv(PASSWORD)).rejects.toThrow();
    expect(exportDir().exists).toBe(false);
  });

  test('wrong guesses count towards the unlock lockout', async () => {
    for (let i = 0; i < 5; i++) await exportPlainCsv('wrong').catch(() => undefined);
    await expect(exportPlainCsv(PASSWORD)).rejects.toMatchObject({ name: 'LockoutError' });
  });

  test('leftovers from an interrupted share are purged', () => {
    const dir = exportDir();
    dir.create({ idempotent: true });
    new File(dir, 'old.csv').create();
    purgeExportFiles();
    expect(dir.exists).toBe(false);
  });
});

describe('export screen', () => {
  test('the CSV option shows the strong warning and needs the master password', async () => {
    await render(<ExportScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Export as plain CSV…' }));
    expect(screen.getByText('This file is NOT encrypted')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Export unencrypted CSV' })).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText(/^Enter your master password/i), 'wrong');
    await fireEvent.press(screen.getByRole('button', { name: 'Export unencrypted CSV' }));
    expect(await screen.findByText('That master password is wrong.')).toBeTruthy();
    expect(share).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText(/^Enter your master password/i), PASSWORD);
    await fireEvent.press(screen.getByRole('button', { name: 'Export unencrypted CSV' }));
    expect(await screen.findByText('Exported')).toBeTruthy();
    expect(share).toHaveBeenCalledTimes(1);
  });

  test('the encrypted option shows no CSV warning', async () => {
    await render(<ExportScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Export encrypted backup' }));
    expect(screen.queryByText('This file is NOT encrypted')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText(/^Enter your master password/i), PASSWORD);
    await fireEvent.press(screen.getByRole('button', { name: 'Export encrypted backup' }));
    expect(await screen.findByText('Exported')).toBeTruthy();
    expect(shared[0]!.name).toMatch(/\.kvault$/);
  });
});

describe('picking a file', () => {
  test('cancelling gives nothing', async () => {
    pick.mockResolvedValueOnce({ canceled: true, assets: null });
    expect(await pickImportFile()).toBeNull();
  });

  test('returns the bytes and deletes the cache copy', async () => {
    const copy = await choose('a.csv', 'hello');
    expect(Buffer.from((await pickImportFile())!).toString()).toBe('hello');
    expect(copy.exists).toBe(false);
  });

  test('refuses a file that is too large before reading it, and still deletes the cache copy', async () => {
    const copy = await choose('big.csv', 'some data');
    pick.mockReset();
    pick.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: copy.uri, name: 'big.csv', size: 50 * 1024 * 1024 }],
    });
    expect(copy.exists).toBe(true);
    await expect(pickImportFile()).rejects.toMatchObject({ code: 'too-large' });
    expect(copy.exists).toBe(false);
  });
});

describe('recognising a file', () => {
  test.each([
    ['chrome.csv', 'chrome-csv'],
    ['bitwarden.csv', 'bitwarden-csv'],
    ['bitwarden.json', 'bitwarden-json'],
  ])('%s is read as %s', (name, format) => {
    const classified = classifyImport(sample(name));
    expect(classified.kind).toBe('plain');
    if (classified.kind === 'plain') expect(classified.parsed.format).toBe(format);
  });

  test('a .kvault file is recognised by its header, whatever it is called', async () => {
    const bytes = (await loadVaultFile(isWellFormedVaultFile))!;
    expect(classifyImport(bytes).kind).toBe('kvault');
  });

  test('random bytes and a damaged vault file are rejected', async () => {
    expect(() => classifyImport(Uint8Array.from([0xff, 0xfe, 0x00, 0x01]))).toThrow();
    const bytes = Uint8Array.from((await loadVaultFile(isWellFormedVaultFile))!);
    expect(() => classifyImport(bytes.slice(0, 10))).toThrow();
    expect(() => classifyImport(utf8Encode('just some words'))).toThrow();
  });
});

describe('import screen', () => {
  const button = (name: string | RegExp) => screen.getByRole('button', { name });

  async function pickAndPreview(name: string, content: Uint8Array | string) {
    await choose(name, content);
    await fireEvent.press(button('Choose a file'));
  }

  test('Chrome CSV: preview, import, then tells the user to delete the file', async () => {
    const sendIntent = jest.spyOn(Linking, 'sendIntent').mockResolvedValue(undefined);
    await render(<ImportScreen />);
    await pickAndPreview('Chrome Passwords.csv', sample('chrome.csv'));

    expect(await screen.findByText('Chrome passwords (CSV)')).toBeTruthy();
    expect(screen.getByText('4 entries found')).toBeTruthy();
    expect(screen.getByText('4 new · 0 already in your vault')).toBeTruthy();
    expect(useVaultStore.getState().data!.entries).toHaveLength(1); // nothing added yet

    await fireEvent.press(button('Import 4 entries'));
    expect(await screen.findByText('Import finished')).toBeTruthy();
    expect(useVaultStore.getState().data!.entries).toHaveLength(5);
    // and it was saved to the vault file, not only held in memory
    expect(await vaultFile().bytes()).toBeTruthy();

    expect(screen.getByText('Delete the file now')).toBeTruthy();
    expect(screen.getByText(/NOT encrypted/)).toBeTruthy();
    await fireEvent.press(button('Open file manager'));
    expect(sendIntent).toHaveBeenCalledWith('android.intent.action.VIEW_DOWNLOADS');
  });

  test('duplicates are detected and can be skipped or imported anyway', async () => {
    const first = render(<ImportScreen />);
    await first;
    await pickAndPreview('chrome.csv', sample('chrome.csv'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Import 4 entries' }));
    await screen.findByText('Import finished');
    await screen.unmount();

    await render(<ImportScreen />);
    await pickAndPreview('chrome.csv', sample('chrome.csv'));
    expect(await screen.findByText('0 new · 4 already in your vault')).toBeTruthy();
    expect(button('Nothing to import')).toBeDisabled(); // duplicates are skipped by default

    await fireEvent(screen.getByLabelText('Skip duplicates'), 'valueChange', false);
    await fireEvent.press(await screen.findByRole('button', { name: 'Import 4 entries' }));
    await screen.findByText('Import finished');
    expect(useVaultStore.getState().data!.entries).toHaveLength(9);
  });

  test('skipping duplicates imports only the new entries', async () => {
    await render(<ImportScreen />);
    await pickAndPreview('chrome.csv', sample('chrome.csv'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Import 4 entries' }));
    await screen.findByText('Import finished');
    await screen.unmount();

    const extra = String(sample('chrome.csv')) + 'Brand new,https://new.test,zed,zed-pass,\n';
    await render(<ImportScreen />);
    await pickAndPreview('chrome2.csv', extra);
    expect(await screen.findByText('1 new · 4 already in your vault')).toBeTruthy();
    await fireEvent.press(button('Import 1 entry'));
    expect(await screen.findByText(/skipped 4 duplicates/)).toBeTruthy();
    expect(useVaultStore.getState().data!.entries).toHaveLength(6);
  });

  test('an encrypted .kvault: asks for its password, then previews, then imports without a delete notice', async () => {
    // A backup made by another vault with a different password and different entries
    await setUpVault([makeEntry({ id: 'other', title: 'From backup', password: 'bk-pass' })]);
    await exportEncrypted(PASSWORD);
    const backup = Uint8Array.from(shared[0]!.bytes);
    await setUpVault(); // the vault on the phone again

    await render(<ImportScreen />);
    await pickAndPreview('KiteVault-2026-01-01.kvault', backup);
    expect(await screen.findByText(/encrypted KiteVault backup/)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText(/^Master password/), 'wrong');
    await fireEvent.press(button('Open backup'));
    expect(await screen.findByText('That master password is wrong.')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText(/^Master password/), PASSWORD);
    await fireEvent.press(button('Open backup'));
    expect(await screen.findByText('KiteVault backup (.kvault)')).toBeTruthy();
    expect(screen.getByText('1 new · 0 already in your vault')).toBeTruthy();
    await fireEvent.press(button('Import 1 entry'));
    expect(await screen.findByText('Import finished')).toBeTruthy();

    const titles = useVaultStore.getState().data!.entries.map((e) => e.title);
    expect(titles).toEqual(['Example Site', 'From backup']);
    expect(screen.queryByText('Delete the file now')).toBeNull();
  });

  test('a file that is not supported is explained and nothing changes', async () => {
    await render(<ImportScreen />);
    await pickAndPreview('notes.txt', 'just some words');
    expect(await screen.findByText(/not a format KiteVault can read/)).toBeTruthy();
    expect(useVaultStore.getState().data!.entries).toHaveLength(1);
  });

  test('a password-protected Bitwarden export is explained', async () => {
    await render(<ImportScreen />);
    await pickAndPreview('enc.json', sample('bitwarden-encrypted.json'));
    expect(await screen.findByText(/password-protected/)).toBeTruthy();
  });
});
