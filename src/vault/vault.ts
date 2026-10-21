import {
  bytesEqual,
  decrypt,
  DEFAULT_KDF_PARAMS,
  deriveKeyFromPassword,
  encrypt,
  generateRandomBytes,
  KEY_LENGTH,
  SALT_LENGTH,
  unwrapKey,
  utf8Decode,
  utf8Encode,
  wipe,
  wrapKey,
  type KdfParams,
} from '@/crypto';
import {
  deleteVaultFile,
  loadVaultFile,
  saveVaultFile,
  vaultExists as storageVaultExists,
  vaultFilesExist,
} from '@/storage';

import { VaultError } from './errors';
import { decodeVaultFile, encodeVaultFile, FORMAT_VERSION, isWellFormedVaultFile } from './format';
import { parseVaultData } from './parseVaultData';
import { createEmptyVaultData, type VaultData } from './types';

type Session = {
  vaultKey: Uint8Array;
  header: ReturnType<typeof decodeVaultFile>['header'];
  data: VaultData;
  // The encrypted body exactly as it is in the file, so a password change can write the file
  // again without encrypting the vault again.
  body: Uint8Array;
};
type Options = { kdfParams?: KdfParams };
type ChangePasswordOptions = Options & {
  // Also replace the vault key and re-encrypt the body. Slower to describe, not slower to run:
  // protects against someone who has BOTH the old password and a copy of the old file. Off by
  // default (the password change only re-wraps the vault key); see docs/DECISIONS.md.
  rotateVaultKey?: boolean;
};

// The vault key and decrypted data exist only here, in memory, while unlocked.
let session: Session | null = null;

// Operations run one at a time so two saves can never interleave their file writes.
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

const wrongPassword = () =>
  new VaultError('WRONG_PASSWORD', 'Wrong password, or the vault file is damaged.');

function requireSession(): Session {
  if (!session) throw new VaultError('LOCKED', 'The vault is locked.');
  return session;
}

// Drops references to decrypted values as early as possible. Strings cannot be zeroed; see
// docs/DECISIONS.md.
function scrub(data: VaultData): void {
  for (const entry of data.entries) {
    entry.password = '';
    entry.totpSecret = undefined;
    entry.notes = '';
    entry.customFields.length = 0;
    entry.passwordHistory.length = 0;
    // Card and identity details are blanked field by field.
    for (const details of [entry.card, entry.identity]) {
      if (!details) continue;
      const fields = details as Record<string, string>;
      for (const key of Object.keys(fields)) fields[key] = '';
    }
    delete entry.card;
    delete entry.identity;
  }
  data.entries.length = 0;
  data.folders.length = 0;
}

function discardSession(): void {
  if (!session) return;
  wipe(session.vaultKey);
  scrub(session.data);
  session = null;
}

function sealBody(vaultKey: Uint8Array, data: VaultData): Uint8Array {
  const plaintext = utf8Encode(JSON.stringify(data));
  try {
    return encrypt(vaultKey, plaintext);
  } finally {
    wipe(plaintext);
  }
}

export function isVaultUnlocked(): boolean {
  return session !== null;
}

export function vaultExists(): Promise<boolean> {
  return storageVaultExists(isWellFormedVaultFile);
}

// Creates a new vault protected by the master password and leaves it unlocked.
export function createVault(masterPassword: string, options: Options = {}): Promise<VaultData> {
  return serialized(async () => {
    if (masterPassword.length === 0) {
      throw new VaultError('INVALID_INPUT', 'Master password must not be empty.');
    }
    if (await vaultExists()) throw new VaultError('VAULT_EXISTS', 'A vault already exists.');

    const kdf = options.kdfParams ?? DEFAULT_KDF_PARAMS;
    const salt = generateRandomBytes(SALT_LENGTH);
    const passwordKey = await deriveKeyFromPassword(masterPassword, salt, kdf);
    const vaultKey = generateRandomBytes(KEY_LENGTH);
    try {
      const data = createEmptyVaultData();
      const header = {
        formatVersion: FORMAT_VERSION,
        kdf,
        salt,
        wrappedKey: wrapKey(passwordKey, vaultKey),
      };
      const body = sealBody(vaultKey, data);
      await saveVaultFile(encodeVaultFile(header, body));
      discardSession();
      session = { vaultKey, header, data, body };
      return data;
    } catch (error) {
      wipe(vaultKey);
      throw error;
    } finally {
      wipe(passwordKey);
    }
  });
}

// Unlocks the vault. Throws WRONG_PASSWORD, CORRUPTED, NO_VAULT or UNSUPPORTED_VERSION.
export function unlockVault(masterPassword: string): Promise<VaultData> {
  return serialized(async () => {
    const bytes = await loadVaultFile(isWellFormedVaultFile);
    if (!bytes) throw new VaultError('NO_VAULT', 'There is no vault on this device.');
    const { header, body } = decodeVaultFile(bytes);

    let passwordKey: Uint8Array;
    try {
      passwordKey = await deriveKeyFromPassword(masterPassword, header.salt, header.kdf);
    } catch {
      // Empty password, or header parameters we refuse to run.
      throw wrongPassword();
    }

    let vaultKey: Uint8Array;
    try {
      vaultKey = unwrapKey(passwordKey, header.wrappedKey);
    } catch {
      throw wrongPassword();
    } finally {
      wipe(passwordKey);
    }

    // The key unwrapped, so the password is right: any failure from here on is a damaged file.
    let plaintext: Uint8Array | undefined;
    try {
      plaintext = decrypt(vaultKey, body);
      const data = parseVaultData(utf8Decode(plaintext));
      discardSession();
      session = { vaultKey, header, data, body };
      return data;
    } catch (error) {
      wipe(vaultKey);
      throw error instanceof VaultError
        ? error
        : new VaultError('CORRUPTED', 'The vault file is damaged.');
    } finally {
      wipe(plaintext);
    }
  });
}

// Unlocks with the vault key itself (used by biometric unlock) instead of the master password.
// Takes ownership of vaultKey: on success the session keeps it, on failure it is wiped.
// Throws WRONG_KEY when the key does not decrypt the vault (for example a stale stored key).
export function unlockVaultWithKey(vaultKey: Uint8Array): Promise<VaultData> {
  return serialized(async () => {
    let plaintext: Uint8Array | undefined;
    try {
      const bytes = await loadVaultFile(isWellFormedVaultFile);
      if (!bytes) throw new VaultError('NO_VAULT', 'There is no vault on this device.');
      const { header, body } = decodeVaultFile(bytes);
      try {
        plaintext = decrypt(vaultKey, body);
      } catch {
        throw new VaultError('WRONG_KEY', 'The stored key does not match this vault.');
      }
      const data = parseVaultData(utf8Decode(plaintext));
      discardSession();
      session = { vaultKey, header, data, body };
      return data;
    } catch (error) {
      wipe(vaultKey);
      throw error instanceof VaultError
        ? error
        : new VaultError('CORRUPTED', 'The vault file is damaged.');
    } finally {
      wipe(plaintext);
    }
  });
}

// A copy of the vault key for wrapping it with the phone's Keystore (biometric unlock).
// The caller must wipe the copy as soon as it has been handed over.
export function getVaultKeyCopy(): Uint8Array {
  // Uint8Array.from copies. Buffer.slice() would NOT: it shares memory, so wiping the "copy" would wipe the session key.
  return Uint8Array.from(requireSession().vaultKey);
}

// Encrypts `data` with a fresh IV and atomically replaces the vault file.
export function saveVault(data: VaultData): Promise<void> {
  return serialized(async () => {
    const current = requireSession();
    // No await between the check above and sealing, so a lock cannot wipe the key mid-save.
    const body = sealBody(current.vaultKey, data);
    await saveVaultFile(encodeVaultFile(current.header, body));
    if (session === current) {
      current.data = data;
      current.body = body;
    }
  });
}

// Wipes the vault key and drops the decrypted data from memory.
export function lockVault(): void {
  discardSession();
}

// Re-protects the vault with a new master password. The old password is checked first.
//
// Default: only the vault key is re-wrapped. A new salt and new KDF settings give a new password
// key, which wraps the SAME vault key, and the file is written again with the encrypted body
// untouched (nothing is re-encrypted). Biometric unlock keeps working because the vault key did
// not change. With rotateVaultKey a new vault key is made and the body is re-encrypted too.
export function changeMasterPassword(
  oldPassword: string,
  newPassword: string,
  options: ChangePasswordOptions = {},
): Promise<void> {
  return serialized(async () => {
    const current = requireSession();
    if (newPassword.length === 0) {
      throw new VaultError('INVALID_INPUT', 'Master password must not be empty.');
    }

    const oldKey = await deriveKeyFromPassword(
      oldPassword,
      current.header.salt,
      current.header.kdf,
    ).catch(() => {
      throw wrongPassword();
    });
    try {
      const unwrapped = unwrapKey(oldKey, current.header.wrappedKey);
      const same = bytesEqual(unwrapped, current.vaultKey);
      wipe(unwrapped);
      if (!same) throw wrongPassword();
    } catch {
      throw wrongPassword();
    } finally {
      wipe(oldKey);
    }

    const kdf = options.kdfParams ?? DEFAULT_KDF_PARAMS;
    const salt = generateRandomBytes(SALT_LENGTH);
    const newPasswordKey = await deriveKeyFromPassword(newPassword, salt, kdf);
    const rotate = options.rotateVaultKey === true;
    const newVaultKey = rotate ? generateRandomBytes(KEY_LENGTH) : null;
    try {
      // The vault may have been locked while the new key was being derived.
      if (session !== current) throw new VaultError('LOCKED', 'The vault is locked.');
      const keyToWrap = newVaultKey ?? current.vaultKey;
      const header = {
        formatVersion: FORMAT_VERSION,
        kdf,
        salt,
        wrappedKey: wrapKey(newPasswordKey, keyToWrap),
      };
      const body = newVaultKey ? sealBody(newVaultKey, current.data) : current.body;
      await saveVaultFile(encodeVaultFile(header, body)); // atomic: old file or new file, never half
      if (session !== current) throw new VaultError('LOCKED', 'The vault is locked.');
      if (newVaultKey) {
        wipe(current.vaultKey);
        current.vaultKey = newVaultKey;
        current.body = body;
      }
      current.header = header;
    } catch (error) {
      if (newVaultKey && (session !== current || current.vaultKey !== newVaultKey))
        wipe(newVaultKey);
      throw error;
    } finally {
      wipe(newPasswordKey);
    }
  });
}

// Permanently deletes the vault file (and its temporary and backup copies) and forgets the
// unlocked vault. Runs in line with saves, so a save that was already waiting cannot bring the
// file back. Throws if any file is still there afterwards; in that case nothing is forgotten.
export function eraseVault(): Promise<void> {
  return serialized(async () => {
    deleteVaultFile();
    if (vaultFilesExist()) deleteVaultFile(); // one more try
    if (vaultFilesExist())
      throw new VaultError('CORRUPTED', 'The vault file could not be deleted.');
    discardSession();
  });
}
