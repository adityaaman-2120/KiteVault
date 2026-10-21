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

export type Entry = {
  id: string;
  type: EntryType;
  title: string;
  username: string;
  password: string;
  urls: string[];
  notes: string;
  customFields: CustomField[];
  totpSecret?: string;
  folderId?: string;
  favorite: boolean;
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
  passwordHistory: PasswordHistoryItem[];
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
