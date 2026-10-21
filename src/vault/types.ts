export const DATA_VERSION = 1;

export type EntryType = 'login' | 'note' | 'card' | 'identity';

export type CustomField = {
  id: string;
  label: string;
  value: string;
  hidden: boolean;
};

export type PasswordHistoryItem = {
  password: string;
  changedAt: number; // epoch ms
};

// Extra fields for the "card" and "identity" entry types. All plain strings, all optional.
export type CardDetails = {
  holder: string;
  number: string;
  expiry: string; // MM/YY
  cvv: string;
  pin: string;
};

export type IdentityDetails = {
  fullName: string;
  email: string;
  phone: string;
  address: string;
};

// How a one-time code is made. Only stored when it differs from the usual SHA-1, 6 digits, 30 s.
export type TotpParams = {
  algorithm: 'SHA1' | 'SHA256' | 'SHA512';
  digits: number;
  period: number; // seconds
};

export type Entry = {
  id: string;
  type: EntryType;
  title: string;
  username: string;
  password: string;
  urls: string[];
  notes: string;
  customFields: CustomField[];
  totpSecret?: string; // base32 secret of the one-time code
  totpParams?: TotpParams;
  folderId?: string;
  favorite: boolean;
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
  passwordHistory: PasswordHistoryItem[];
  card?: CardDetails;
  identity?: IdentityDetails;
  // Set when the entry is moved to the Trash (epoch ms). Removed for good after 30 days.
  deletedAt?: number;
};

export type Folder = {
  id: string;
  name: string;
};

export type VaultSettings = {
  autoLockSeconds: number;
  clipboardClearSeconds: number;
};

// The decrypted vault. Lives only in memory while unlocked.
export type VaultData = {
  version: number;
  entries: Entry[];
  folders: Folder[];
  settings: VaultSettings;
};

export function createEmptyVaultData(): VaultData {
  return {
    version: DATA_VERSION,
    entries: [],
    folders: [],
    settings: { autoLockSeconds: 60, clipboardClearSeconds: 30 },
  };
}
