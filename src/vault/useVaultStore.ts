import { create } from 'zustand';

import { useSessionStore } from '@/features/session/useSessionStore';
import { disableBiometricUnlock } from '@/native/keystore';

import { VaultError } from './errors';
import {
  changeMasterPassword,
  createVault,
  lockVault,
  recoverVault,
  restoreVaultFromBackup,
  saveVault,
  unlockVault,
  unlockVaultWithKey,
  vaultExists,
} from './vault';
import type { VaultData } from './types';

type VaultState = {
  // Decrypted vault. Non-null only while unlocked; never persisted anywhere.
  data: VaultData | null;
  initialize: () => Promise<void>;
  create: (masterPassword: string) => Promise<void>;
  unlock: (masterPassword: string) => Promise<void>;
  // Unlocks with the vault key from biometrics. Takes ownership of the bytes.
  unlockWithKey: (vaultKey: Uint8Array) => Promise<void>;
  // "Forgot master password": opens the vault with a recovery key and sets a new master password.
  recover: (recoveryKey: string, newPassword: string) => Promise<void>;
  // Opens a vault downloaded from a cloud backup (see restoreVaultFromBackup).
  restore: (backup: Uint8Array, masterPassword: string) => Promise<void>;
  lock: () => void;
  // Replaces the vault contents and writes them to disk.
  save: (data: VaultData) => Promise<void>;
  // Checks the old password, then protects the vault with the new one (see changeMasterPassword).
  changePassword: (
    oldPassword: string,
    newPassword: string,
    options?: { rotateVaultKey?: boolean },
  ) => Promise<void>;
};

// Deliberately no persist middleware: decrypted data must never be written out by the store.
export const useVaultStore = create<VaultState>((set, get) => ({
  data: null,

  async initialize() {
    const exists = await vaultExists();
    useSessionStore.getState().setStatus(exists ? 'locked' : 'no-vault');
  },

  async create(masterPassword) {
    const data = await createVault(masterPassword);
    // A key left over from an earlier vault must never be usable with this new one.
    disableBiometricUnlock();
    set({ data });
    useSessionStore.getState().setStatus('unlocked');
  },

  async unlock(masterPassword) {
    const data = await unlockVault(masterPassword);
    set({ data });
    useSessionStore.getState().setStatus('unlocked');
  },

  async unlockWithKey(vaultKey) {
    const data = await unlockVaultWithKey(vaultKey);
    set({ data });
    useSessionStore.getState().setStatus('unlocked');
  },

  async restore(backup, masterPassword) {
    const data = await restoreVaultFromBackup(backup, masterPassword);
    set({ data });
    useSessionStore.getState().setStatus('unlocked');
  },

  async recover(recoveryKey, newPassword) {
    const data = await recoverVault(recoveryKey, newPassword);
    set({ data });
    useSessionStore.getState().setStatus('unlocked');
  },

  lock() {
    set({ data: null }); // drop the store's reference before the vault scrubs its copy
    lockVault();
    useSessionStore.getState().setStatus('locked');
  },

  async save(data) {
    if (!get().data) throw new VaultError('LOCKED', 'The vault is locked.');
    await saveVault(data);
    set({ data });
  },

  async changePassword(oldPassword, newPassword, options) {
    await changeMasterPassword(oldPassword, newPassword, options);
    // Only a new vault key makes the key stored for biometrics stale; re-wrapping keeps it valid.
    if (options?.rotateVaultKey) disableBiometricUnlock();
  },
}));
