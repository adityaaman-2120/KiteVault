import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { runWithAttemptLimit } from '@/features/lock/unlockService';
import { loadVaultFile } from '@/storage';
import { isWellFormedVaultFile, useVaultStore, verifyMasterPassword } from '@/vault';

import { entriesToCsv, exportableEntries } from './csvExport';

export class ExportError extends Error {
  readonly code: 'sharing-unavailable' | 'no-vault';
  constructor(code: 'sharing-unavailable' | 'no-vault') {
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

// An encrypted KiteVault backup: the vault file exactly as it is stored, so it stays protected by
// the master password (and recovery key, if there is one) it has now. Nothing is decrypted.
// The master password is asked for again, and wrong guesses count like wrong unlock attempts.
export async function exportEncrypted(masterPassword: string): Promise<void> {
  await runWithAttemptLimit(() => verifyMasterPassword(masterPassword));
  const bytes = await loadVaultFile(isWellFormedVaultFile);
  if (!bytes) throw new ExportError('no-vault');
  await shareTemporaryFile(`KiteVault-${today()}.kvault`, bytes, 'application/octet-stream');
}

// A plain, UNENCRYPTED CSV of everything outside the Trash. Returns how many entries it holds.
export async function exportPlainCsv(masterPassword: string): Promise<number> {
  await runWithAttemptLimit(() => verifyMasterPassword(masterPassword));
  const data = useVaultStore.getState().data;
  if (!data) throw new ExportError('no-vault');
  await shareTemporaryFile(`KiteVault-passwords-${today()}.csv`, entriesToCsv(data), 'text/csv');
  return exportableEntries(data).length;
}
