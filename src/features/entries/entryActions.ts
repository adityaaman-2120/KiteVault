import { useVaultStore, VaultError, type Entry, type VaultData } from '@/vault';

import { entryToForm, formToEntry, type EntryFormValues } from './entrySchema';
import { purgeExpiredTrash, newId } from './model';
import { withoutSeedEntries, withSeedEntries } from './seed';

export class EntryActionError extends Error {
  readonly code: 'NOT_FOUND' | 'INVALID_FOLDER';

  constructor(code: EntryActionError['code'], message: string) {
    super(message);
    this.name = 'EntryActionError';
    this.code = code;
  }
}

// Changes are applied one at a time, each to the newest data, so two quick edits can never
// overwrite each other with stale copies.
let queue: Promise<unknown> = Promise.resolve();

// Applies `change` to the current vault data and saves the result with saveVault().
// The change only becomes visible if saving works: on failure the store and the file keep the
// previous data and the error is thrown to the caller (who shows it).
export function mutateVault(change: (data: VaultData) => VaultData): Promise<void> {
  const run = queue.then(async () => {
    const store = useVaultStore.getState();
    if (!store.data) throw new VaultError('LOCKED', 'The vault is locked.');
    const next = change(store.data);
    if (next === store.data) return;
    await store.save(next);
  });
  queue = run.catch(() => undefined);
  return run;
}

// Plain-language text for the dialog shown when a change could not be saved.
export function describeSaveError(error: unknown): string {
  if (error instanceof VaultError && error.code === 'LOCKED') {
    return 'The vault is locked. Unlock it and try again.';
  }
  if (error instanceof EntryActionError) return error.message;
  return 'Your change could not be saved, so nothing was changed. Please try again.';
}

const replaceEntry = (data: VaultData, id: string, update: (e: Entry) => Entry): VaultData => {
  const index = data.entries.findIndex((e) => e.id === id);
  if (index === -1) throw new EntryActionError('NOT_FOUND', 'This entry no longer exists.');
  const entries = data.entries.slice();
  entries[index] = update(data.entries[index]!);
  return { ...data, entries };
};

// Saves the form as a new entry, or as an edit of `existingId`. Returns the entry's id.
export async function saveEntryFromForm(
  values: EntryFormValues,
  existingId?: string,
  now: () => number = Date.now,
): Promise<string> {
  let savedId = existingId ?? '';
  await mutateVault((data) => {
    if (existingId === undefined) {
      const entry = formToEntry(values, undefined, now());
      savedId = entry.id;
      return { ...data, entries: [...data.entries, entry] };
    }
    return replaceEntry(data, existingId, (existing) => formToEntry(values, existing, now()));
  });
  return savedId;
}

export const setFavorite = (id: string, favorite: boolean, now: () => number = Date.now) =>
  mutateVault((data) =>
    replaceEntry(data, id, (e) =>
      e.favorite === favorite ? e : { ...e, favorite, updatedAt: now() },
    ),
  );

export const moveToTrash = (id: string, now: () => number = Date.now) =>
  mutateVault((data) => replaceEntry(data, id, (e) => ({ ...e, deletedAt: now() })));

export const restoreFromTrash = (id: string) =>
  mutateVault((data) =>
    replaceEntry(data, id, (e) => {
      const restored = { ...e };
      delete restored.deletedAt;
      return restored;
    }),
  );

export const deleteForever = (id: string) =>
  mutateVault((data) => {
    if (!data.entries.some((e) => e.id === id)) {
      throw new EntryActionError('NOT_FOUND', 'This entry no longer exists.');
    }
    return { ...data, entries: data.entries.filter((e) => e.id !== id) };
  });

export const emptyTrash = () =>
  mutateVault((data) => {
    const entries = data.entries.filter((e) => e.deletedAt === undefined);
    return entries.length === data.entries.length ? data : { ...data, entries };
  });

// Permanently removes trashed entries older than 30 days. Does nothing (and does not save) if
// there are none.
export const purgeExpired = (now: () => number = Date.now) =>
  mutateVault((data) => purgeExpiredTrash(data, now()));

// --- folders -----------------------------------------------------------------------------

function cleanFolderName(data: VaultData, raw: string, ignoreId?: string): string {
  const name = raw.trim();
  if (!name) throw new EntryActionError('INVALID_FOLDER', 'Enter a folder name.');
  if (name.length > 50) {
    throw new EntryActionError('INVALID_FOLDER', 'Folder names can have at most 50 characters.');
  }
  const taken = data.folders.some(
    (f) => f.id !== ignoreId && f.name.toLowerCase() === name.toLowerCase(),
  );
  if (taken)
    throw new EntryActionError('INVALID_FOLDER', 'You already have a folder with that name.');
  return name;
}

export async function addFolder(rawName: string): Promise<string> {
  const id = newId();
  await mutateVault((data) => ({
    ...data,
    folders: [...data.folders, { id, name: cleanFolderName(data, rawName) }],
  }));
  return id;
}

export const renameFolder = (id: string, rawName: string) =>
  mutateVault((data) => {
    if (!data.folders.some((f) => f.id === id)) {
      throw new EntryActionError('NOT_FOUND', 'This folder no longer exists.');
    }
    const name = cleanFolderName(data, rawName, id);
    return { ...data, folders: data.folders.map((f) => (f.id === id ? { ...f, name } : f)) };
  });

// Deleting a folder never deletes entries: they just become "no folder".
export const deleteFolder = (id: string) =>
  mutateVault((data) => ({
    ...data,
    folders: data.folders.filter((f) => f.id !== id),
    entries: data.entries.map((e) => {
      if (e.folderId !== id) return e;
      const moved = { ...e };
      delete moved.folderId;
      return moved;
    }),
  }));

// Development only (see seed.ts): fake entries to test list speed.
export const seedFakeEntries = (count: number, now: () => number = Date.now) =>
  mutateVault((data) => withSeedEntries(data, count, now()));

export const removeSeedEntries = () => mutateVault((data) => withoutSeedEntries(data));

export { entryToForm };
