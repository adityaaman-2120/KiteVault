import { File, Paths } from 'expo-file-system';

import { bytesEqual } from '@/crypto';

// App-private document directory. Three names make a save crash-safe:
//   vault.kvlt      the current vault
//   vault.kvlt.tmp  the new version while it is being written
//   vault.kvlt.bak  the previous version, only during the swap
const MAIN = 'vault.kvlt';
const TMP = 'vault.kvlt.tmp';
const BAK = 'vault.kvlt.bak';

// A fresh File each time: File.move() re-points the instance at the destination.
const file = (name: string) => new File(Paths.document, name);

export class StorageError extends Error {
  // 'no-space': the phone is out of storage. 'write-failed': anything else went wrong.
  readonly kind: 'no-space' | 'write-failed';

  constructor(message: string, kind: StorageError['kind'] = 'write-failed') {
    super(message);
    this.name = 'StorageError';
    this.kind = kind;
  }
}

// Android reports a full disk as ENOSPC / "No space left on device". The text can come wrapped in
// another error, so it is looked for in the message.
const isOutOfSpaceError = (error: unknown): boolean =>
  error instanceof Error && /ENOSPC|no space left|not enough space|disk full/i.test(error.message);

export const isOutOfSpace = (error: unknown): boolean =>
  error instanceof StorageError && error.kind === 'no-space';

export type VaultFileValidator = (bytes: Uint8Array) => boolean;

function removeQuietly(name: string): void {
  try {
    const f = file(name);
    if (f.exists) f.delete();
  } catch {
    // Leftovers are cleaned up on the next load or save.
  }
}

// Told after every successful write of the vault file (a save, a password change, a restore).
// The cloud backup uses it to know that the file changed; it receives no data.
const savedListeners = new Set<() => void>();

export function onVaultFileSaved(listener: () => void): () => void {
  savedListeners.add(listener);
  return () => {
    savedListeners.delete(listener);
  };
}

// Writes the new bytes next to the vault, then swaps them in with renames.
//
// expo-file-system's move({ overwrite: true }) deletes the destination before renaming, so it is
// not atomic. We only use moves onto a free name, which are plain renames, and keep the old
// vault as .bak until the new one is in place. At every step either vault.kvlt or vault.kvlt.bak
// holds a complete vault, and recoverVaultFile() restores it after a crash.
export async function saveVaultFile(bytes: Uint8Array): Promise<void> {
  removeQuietly(TMP);
  // A full phone or a failed write must leave the current vault exactly as it was: nothing but the
  // temporary file is touched until the new version has been written and read back.
  try {
    const tmp = file(TMP);
    tmp.create();
    await tmp.write(bytes);
    // Read back so a short or failed write is caught before it can replace the real vault.
    if (!bytesEqual(await file(TMP).bytes(), bytes)) {
      throw new StorageError('Vault file was not written correctly.');
    }
  } catch (error) {
    removeQuietly(TMP);
    if (error instanceof StorageError) throw error;
    throw isOutOfSpaceError(error)
      ? new StorageError('The phone is out of storage space.', 'no-space')
      : new StorageError('Vault file could not be written.');
  }

  try {
    removeQuietly(BAK);
    if (file(MAIN).exists) await file(MAIN).move(file(BAK));
    await file(TMP).move(file(MAIN));
  } catch {
    // The swap stopped half way. Put the old vault back so this run carries on with a vault file;
    // if even that fails, recoverVaultFile() does it at the next start.
    try {
      if (!file(MAIN).exists && file(BAK).exists) await file(BAK).move(file(MAIN));
      removeQuietly(TMP);
    } catch {
      // Left for recoverVaultFile().
    }
    throw new StorageError('Vault file could not be replaced.');
  }
  removeQuietly(BAK);
  for (const listener of [...savedListeners]) {
    try {
      listener();
    } catch {
      // A listener must never make a successful save look like a failure.
    }
  }
}

// Cleans up after an interrupted save. `isValid` tells a complete vault from a damaged file.
export async function recoverVaultFile(isValid: VaultFileValidator): Promise<void> {
  const mainOk = file(MAIN).exists && isValid(await file(MAIN).bytes());
  const bakOk = file(BAK).exists && isValid(await file(BAK).bytes());

  if (!mainOk && bakOk) {
    removeQuietly(MAIN);
    await file(BAK).move(file(MAIN));
  }
  // A leftover .tmp was never acknowledged as saved, so it is always discarded.
  removeQuietly(TMP);
  if (file(MAIN).exists) removeQuietly(BAK);
}

export async function vaultExists(isValid: VaultFileValidator = () => true): Promise<boolean> {
  await recoverVaultFile(isValid);
  return file(MAIN).exists;
}

// Returns null when there is no vault file.
export async function loadVaultFile(
  isValid: VaultFileValidator = () => true,
): Promise<Uint8Array | null> {
  await recoverVaultFile(isValid);
  const main = file(MAIN);
  return main.exists ? await main.bytes() : null;
}

// True if the vault, or any leftover temporary / backup copy of it, is still on disk. Looks only;
// unlike vaultExists() it never restores anything.
export function vaultFilesExist(): boolean {
  return [MAIN, TMP, BAK].some((name) => file(name).exists);
}

export function deleteVaultFile(): void {
  removeQuietly(TMP);
  removeQuietly(BAK);
  removeQuietly(MAIN);
}
