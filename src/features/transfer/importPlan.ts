import { newId } from '@/features/entries/model';
import type { Entry, Folder, VaultData } from '@/vault';

import type { ImportedEntry } from './types';

const norm = (text: string) => text.trim().toLowerCase();
const normUrl = (url: string) =>
  norm(url)
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');

// Two entries are duplicates when what identifies them matches. For a login that is the name, the
// user name, the first address AND the password: a login with the same name but another password
// is not a duplicate, so importing never hides a different password.
export function duplicateKey(entry: ImportedEntry | Entry): string {
  switch (entry.type) {
    case 'login':
      return [
        'login',
        norm(entry.title),
        norm(entry.username),
        normUrl(entry.urls[0] ?? ''),
        entry.password,
      ].join('\u0000');
    case 'card':
      return [
        'card',
        norm(entry.title),
        norm(entry.card?.holder ?? ''),
        entry.card?.number ?? '',
      ].join('\u0000');
    case 'identity':
      return [
        'identity',
        norm(entry.title),
        norm(entry.identity?.fullName ?? ''),
        norm(entry.identity?.email ?? ''),
      ].join('\u0000');
    default:
      return ['note', norm(entry.title), entry.notes.trim()].join('\u0000');
  }
}

export type PlannedEntry = { entry: ImportedEntry; duplicate: boolean };

export type ImportPlan = {
  items: PlannedEntry[];
  duplicates: number;
  fresh: number;
};

// Marks which of the incoming entries already exist in the vault (entries in the Trash do not
// count). A second copy of the same entry inside the file counts as a duplicate too.
export function planImport(existing: VaultData, incoming: ImportedEntry[]): ImportPlan {
  const seen = new Set(existing.entries.filter((e) => e.deletedAt === undefined).map(duplicateKey));
  const items = incoming.map((entry) => {
    const key = duplicateKey(entry);
    const duplicate = seen.has(key);
    seen.add(key);
    return { entry, duplicate };
  });
  const duplicates = items.filter((i) => i.duplicate).length;
  return { items, duplicates, fresh: items.length - duplicates };
}

export type ImportOutcome = { data: VaultData; imported: number; skipped: number };

// Adds the planned entries to a copy of the vault. Every imported entry gets a new id, so nothing
// already in the vault is overwritten. Folders are matched by name (ignoring case) or created.
export function applyImport(
  data: VaultData,
  plan: ImportPlan,
  options: { skipDuplicates: boolean },
): ImportOutcome {
  const folders: Folder[] = [...data.folders];
  const folderId = (name: string): string => {
    const found = folders.find((f) => norm(f.name) === norm(name));
    if (found) return found.id;
    const created = { id: newId(), name: name.trim() };
    folders.push(created);
    return created.id;
  };

  const added: Entry[] = [];
  let skipped = 0;
  for (const { entry, duplicate } of plan.items) {
    if (duplicate && options.skipDuplicates) {
      skipped++;
      continue;
    }
    const { folderName, ...rest } = entry;
    const imported: Entry = { ...rest, id: newId() };
    if (folderName?.trim()) imported.folderId = folderId(folderName);
    else delete imported.folderId;
    added.push(imported);
  }
  return {
    data: { ...data, folders, entries: [...data.entries, ...added] },
    imported: added.length,
    skipped,
  };
}
