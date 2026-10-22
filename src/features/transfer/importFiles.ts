import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Alert, Linking } from 'react-native';

import { utf8Decode } from '@/crypto';
import { runWithAttemptLimit } from '@/features/lock/unlockService';
import { isWellFormedVaultFile, readBackupData, type VaultData } from '@/vault';

import { parsePlainImport } from './parsers';
import { ImportError, MAX_IMPORT_BYTES, type ImportedEntry, type ParsedImport } from './types';

// Lets the user choose a file and returns its bytes. The picker hands over a copy in the app's
// cache; that copy is deleted straight away. The user's original is never touched.
export async function pickImportFile(): Promise<Uint8Array | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*', // Android reports .kvault and .csv with unreliable types, so every file is offered
    copyToCacheDirectory: true,
    multiple: false,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  // The copy in the cache is deleted on every path out of here, including refusing a big file.
  const copy = new File(asset.uri);
  try {
    if ((asset.size ?? 0) > MAX_IMPORT_BYTES) throw new ImportError('too-large');
    const bytes = await copy.bytes();
    if (bytes.length > MAX_IMPORT_BYTES) throw new ImportError('too-large');
    return bytes;
  } finally {
    try {
      if (copy.exists) copy.delete();
    } catch {
      // Android clears the cache by itself.
    }
  }
}

export type Classified =
  | { kind: 'kvault'; bytes: Uint8Array } // needs its password before it can be read
  | { kind: 'plain'; parsed: ParsedImport };

// A KiteVault file is recognised by its header; anything else is read as text.
export function classifyImport(bytes: Uint8Array, now: number = Date.now()): Classified {
  if (bytes.length > MAX_IMPORT_BYTES) throw new ImportError('too-large');
  if (isWellFormedVaultFile(bytes)) return { kind: 'kvault', bytes };
  let text: string;
  try {
    text = utf8Decode(bytes);
  } catch {
    throw new ImportError('unknown-format');
  }
  return { kind: 'plain', parsed: parsePlainImport(text, now) };
}

// Opens a .kvault file with its master password (the one it had when it was exported). Wrong
// guesses count like wrong unlock attempts.
export async function readKvault(bytes: Uint8Array, masterPassword: string): Promise<ParsedImport> {
  let data!: VaultData;
  await runWithAttemptLimit(async () => {
    data = await readBackupData(bytes, masterPassword);
  });
  const folders = new Map(data.folders.map((f) => [f.id, f.name]));
  const entries: ImportedEntry[] = data.entries.map(({ id: _id, folderId, ...rest }) => {
    const folderName = folderId ? folders.get(folderId) : undefined;
    return folderName ? { ...rest, folderName } : rest;
  });
  if (entries.length === 0) throw new ImportError('empty');
  return { format: 'kvault', entries, skipped: 0 };
}

// Opens the Downloads app, where most exported files end up. Android has no way to open one
// particular file's folder, so if that fails the user is told what to do instead.
export async function openFileManager(): Promise<void> {
  try {
    await Linking.sendIntent('android.intent.action.VIEW_DOWNLOADS');
  } catch {
    Alert.alert(
      'Open your files app',
      'Open the Files or Downloads app on your phone and delete the file you imported.',
    );
  }
}
