import { createVault, useVaultStore, type Entry, type Folder } from '@/vault';
import { FAST_KDF, makeEntry, resetVaultFiles } from '@/vault/__support__/testUtils';

export { FAST_KDF, makeEntry, resetVaultFiles };

export function entry(overrides: Partial<Entry> = {}): Entry {
  return makeEntry({
    id: overrides.id ?? 'e1',
    title: 'Example Site',
    username: 'alice@example.com',
    password: 'hunter2',
    urls: ['https://example.com'],
    notes: '',
    customFields: [],
    totpSecret: undefined,
    passwordHistory: [],
    ...overrides,
  });
}

// An unlocked vault (real encryption and file writes, cheap key derivation) that already holds
// the given entries and folders, with the store in sync.
export async function unlockedVaultWith(entries: Entry[] = [], folders: Folder[] = []) {
  resetVaultFiles();
  const created = await createVault('correct horse battery staple', { kdfParams: FAST_KDF });
  useVaultStore.setState({ data: created });
  await useVaultStore.getState().save({ ...created, entries, folders });
}

// Only puts data in the store (no vault session, nothing is saved). For read-only screens.
export function showInStore(entries: Entry[], folders: Folder[] = []) {
  useVaultStore.setState({
    data: {
      version: 1,
      entries,
      folders,
      settings: { autoLockSeconds: 60, clipboardClearSeconds: 30 },
    },
  });
}

export const storeEntries = (): Entry[] => useVaultStore.getState().data?.entries ?? [];
