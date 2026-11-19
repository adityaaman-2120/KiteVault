import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { runWithAttemptLimit } from '@/features/lock/unlockService';
import { loadVaultFile } from '@/storage';
import { isWellFormedVaultFile, useVaultStore, verifyMasterPassword } from '@/vault';

import { chromeCsvEntries, entriesToChromeCsv, entriesToCsv, exportableEntries } from './csvExport';
import { entriesToBitwardenJson } from './jsonExport';

export class ExportError extends Error {
  readonly code: 'sharing-unavailable' | 'no-vault' | 'cancelled';
  constructor(code: 'sharing-unavailable' | 'no-vault' | 'cancelled') {
    super(`Export error: ${code}`);
    this.name = 'ExportError';
    this.code = code;
  }
}

// Files made for sharing live in their own folder of the app's private cache, so all of them can
// be removed at once.
const exportDir = () => new Directory(Paths.cache, 'kitevault-exports');

// Removes every file left over from an export. Called after each share, when the export screen
// opens and when the app starts, so a readable CSV never stays behind for long.
export function purgeExportFiles(): void {
  try {
    const dir = exportDir();
    if (dir.exists) dir.delete();
  } catch {
    // Nothing more can be done; the next call tries again.
  }
}

const today = () => new Date().toISOString().slice(0, 10);

async function shareTemporaryFile(
  name: string,
  content: string | Uint8Array,
  mimeType: string,
): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new ExportError('sharing-unavailable');
  purgeExportFiles();
  try {
    const dir = exportDir();
    dir.create({ idempotent: true });
    const file = new File(dir, name);
    file.create();
    await file.write(content);
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: 'Export from KiteVault' });
  } finally {
    purgeExportFiles();
  }
}

// Writes straight into a folder the user picks (Android's folder picker grants access to that one
// folder only). The file stays there: it is the user's copy now, so nothing is deleted afterwards.
async function saveToChosenFolder(
  name: string,
  content: string | Uint8Array,
  mimeType: string,
): Promise<string> {
  let dir: Directory;
  try {
    dir = await Directory.pickDirectoryAsync();
  } catch {
    // The picker throws when it is closed without choosing a folder.
    throw new ExportError('cancelled');
  }
  const file = dir.createFile(name, mimeType);
  try {
    await file.write(content);
  } catch (e) {
    // Do not leave a half-written file behind.
    try {
      file.delete();
    } catch {
      // Nothing more can be done.
    }
    throw e;
  }
  return file.name;
}

// 'csv' is Bitwarden's layout; 'csv-chrome' is the simple layout Chrome, Edge and Google import.
export type ExportFormat = 'kvault' | 'csv' | 'csv-chrome' | 'json';
export type ExportDestination = 'folder' | 'share';

// Formats that put every password in readable text.
export const isPlainExport = (format: ExportFormat): boolean => format !== 'kvault';

export type ExportResult = { fileName: string; count: number; destination: ExportDestination };

// One entry point for every format and destination. The master password is asked for again, and
// wrong guesses count like wrong unlock attempts, so a stranger holding an unlocked phone cannot
// guess it here. .kvault is the vault file exactly as stored: nothing is decrypted, and it stays
// protected by the master password (and recovery key) it has now.
export async function exportVault(
  format: ExportFormat,
  masterPassword: string,
  destination: ExportDestination = 'share',
): Promise<ExportResult> {
  await runWithAttemptLimit(() => verifyMasterPassword(masterPassword));
  const data = useVaultStore.getState().data;
  if (!data) throw new ExportError('no-vault');

  let fileName: string;
  let content: string | Uint8Array;
  let mimeType: string;
  if (format === 'kvault') {
    const bytes = await loadVaultFile(isWellFormedVaultFile);
    if (!bytes) throw new ExportError('no-vault');
    [fileName, content, mimeType] = [
      `KiteVault-${today()}.kvault`,
      bytes,
      'application/octet-stream',
    ];
  } else if (format === 'csv-chrome') {
    [fileName, content, mimeType] = [
      `KiteVault-for-Chrome-${today()}.csv`,
      entriesToChromeCsv(data),
      'text/csv',
    ];
  } else if (format === 'csv') {
    [fileName, content, mimeType] = [
      `KiteVault-passwords-${today()}.csv`,
      entriesToCsv(data),
      'text/csv',
    ];
  } else {
    [fileName, content, mimeType] = [
      `KiteVault-passwords-${today()}.json`,
      entriesToBitwardenJson(data),
      'application/json',
    ];
  }

  const count =
    format === 'kvault'
      ? data.entries.length
      : format === 'csv-chrome'
        ? chromeCsvEntries(data).length
        : exportableEntries(data).length;
  if (destination === 'folder') {
    fileName = await saveToChosenFolder(fileName, content, mimeType);
  } else {
    await shareTemporaryFile(fileName, content, mimeType);
  }
  return { fileName, count, destination };
}

export const exportEncrypted = (masterPassword: string): Promise<ExportResult> =>
  exportVault('kvault', masterPassword);

// Returns how many entries the CSV holds.
export async function exportPlainCsv(masterPassword: string): Promise<number> {
  return (await exportVault('csv', masterPassword)).count;
}
