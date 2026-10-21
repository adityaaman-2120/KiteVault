export { VaultError, type VaultErrorCode } from './errors';
export { isWellFormedVaultFile } from './format';
export { useVaultStore } from './useVaultStore';
export {
  changeMasterPassword,
  createVault,
  eraseVault,
  getRecoveryInfo,
  getVaultKeyCopy,
  isVaultUnlocked,
  lockVault,
  readBackupData,
  recoverVault,
  restoreVaultFromBackup,
  removeRecoveryKey,
  saveVault,
  setRecoveryKey,
  unlockVault,
  unlockVaultWithKey,
  verifyMasterPassword,
  type RecoveryInfo,
  vaultExists,
} from './vault';
export {
  createEmptyVaultData,
  type CardDetails,
  type CustomField,
  type Entry,
  type EntryType,
  type IdentityDetails,
  type Folder,
  type PasswordHistoryItem,
  type VaultData,
  type VaultSettings,
} from './types';
export {
  countRecoveryCharacters,
  formatRecoveryKey,
  generateRecoveryKey,
  normalizeRecoveryText,
  parseRecoveryKey,
  RECOVERY_GROUPS,
  RECOVERY_KEY_CHARACTERS,
  RecoveryKeyFormatError,
} from './recoveryKey';
export { mergeVaults, type MergeOptions, type MergeResult, type MergeSummary } from './merge';
