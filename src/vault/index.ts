export { VaultError, type VaultErrorCode } from './errors';
export { useVaultStore } from './useVaultStore';
export {
  changeMasterPassword,
  createVault,
  getVaultKeyCopy,
  isVaultUnlocked,
  lockVault,
  saveVault,
  unlockVault,
  unlockVaultWithKey,
  vaultExists,
} from './vault';
export {
  createEmptyVaultData,
  type CustomField,
  type Entry,
  type EntryType,
  type Folder,
  type PasswordHistoryItem,
  type VaultData,
  type VaultSettings,
} from './types';
