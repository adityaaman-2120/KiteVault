import { File, Paths } from 'expo-file-system';

import { DEFAULT_KDF_PARAMS, type KdfParams } from '@/crypto';
import { deleteVaultFile } from '@/storage';

import type { Entry, VaultData } from '../types';
import { lockVault } from '../vault';

// Cheaper than production settings (still above the enforced floor) to keep tests quick.
export const FAST_KDF: KdfParams = { ...DEFAULT_KDF_PARAMS, memoryKiB: 19 * 1024, iterations: 2 };

export const vaultFile = (name = 'vault.kvlt') => new File(Paths.document, name);

export function resetVaultFiles(): void {
  lockVault();
  deleteVaultFile();
}

export function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'entry-1',
    type: 'login',
    title: 'Example Site',
    username: 'alice@example.com',
    password: 'hunter2-unique-marker',
    urls: ['https://example.com'],
    notes: 'some private note',
    customFields: [{ id: 'f1', label: 'PIN', value: '1234', hidden: true }],
    totpSecret: 'JBSWY3DPEHPK3PXP',
    favorite: false,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    passwordHistory: [{ password: 'old-password', changedAt: 1_690_000_000_000 }],
    ...overrides,
  };
}

export function withEntries(data: VaultData, ...entries: Entry[]): VaultData {
  return { ...data, entries: [...data.entries, ...entries] };
}

// Deep copy, so assertions are not affected when the vault scrubs its own objects on lock.
export function snapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
