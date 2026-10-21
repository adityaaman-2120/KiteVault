import { create } from 'zustand';

import { useSessionStore } from '@/features/session/useSessionStore';

import { VaultError } from './errors';
import {
  changeMasterPassword,
  createVault,
  lockVault,
  saveVault,
  unlockVault,
  vaultExists,
} from './vault';
import type { VaultData } from './types';

type VaultState = {
  // Decrypted vault. Non-null only while unlocked; never persisted anywhere.
  data: VaultData | null;
  initialize: () => Promise<void>;
  create: (masterPassword: string) => Promise<void>;
  unlock: (masterPassword: string) => Promise<void>;
  lock: () => void;
  // Replaces the vault contents and writes them to disk.
  save: (data: VaultData) => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
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
    set({ data });
    useSessionStore.getState().setStatus('unlocked');
  },

  async unlock(masterPassword) {
    const data = await unlockVault(masterPassword);
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

  changePassword: changeMasterPassword,
}));
