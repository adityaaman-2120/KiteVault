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
import { loadVaultFile, saveVaultFile, vaultExists as storageVaultExists } from '@/storage';

import { VaultError } from './errors';
import { decodeVaultFile, encodeVaultFile, FORMAT_VERSION, isWellFormedVaultFile } from './format';
import { parseVaultData } from './parseVaultData';
import { createEmptyVaultData, type VaultData } from './types';

type Session = {
  vaultKey: Uint8Array;
  header: ReturnType<typeof decodeVaultFile>['header'];
  data: VaultData;
};
type Options = { kdfParams?: KdfParams };

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
      await saveVaultFile(encodeVaultFile(header, sealBody(vaultKey, data)));
      discardSession();
      session = { vaultKey, header, data };
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
      session = { vaultKey, header, data };
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
      session = { vaultKey, header, data };
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
    if (session === current) current.data = data;
  });
}

// Wipes the vault key and drops the decrypted data from memory.
export function lockVault(): void {
  discardSession();
}

// Re-protects the vault with a new master password. A new salt and a new vault key are used, so
// anyone who held the old password and an old copy of the file cannot read the new file.
export function changeMasterPassword(
  oldPassword: string,
  newPassword: string,
  options: Options = {},
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
    const newVaultKey = generateRandomBytes(KEY_LENGTH);
    try {
      // The vault may have been locked while the new key was being derived.
      if (session !== current) throw new VaultError('LOCKED', 'The vault is locked.');
      const header = {
        formatVersion: FORMAT_VERSION,
        kdf,
        salt,
        wrappedKey: wrapKey(newPasswordKey, newVaultKey),
      };
      await saveVaultFile(encodeVaultFile(header, sealBody(newVaultKey, current.data)));
      if (session !== current) throw new VaultError('LOCKED', 'The vault is locked.');
      wipe(current.vaultKey);
      current.vaultKey = newVaultKey;
      current.header = header;
    } catch (error) {
      if (session !== current || current.vaultKey !== newVaultKey) wipe(newVaultKey);
      throw error;
    } finally {
      wipe(newPasswordKey);
    }
  });
}
