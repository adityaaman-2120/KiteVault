import type { Entry, EntryType, VaultData } from '@/vault';

// DEVELOPMENT ONLY. Fake entries for checking that a big vault stays fast. Everything is
// derived from the entry number (no randomness), and every id starts with "seed-" so the
// entries can be found and removed again.
export const SEED_PREFIX = 'seed-';
export const SEED_FOLDER_PREFIX = 'seed-folder-';

const TYPES: EntryType[] = ['login', 'login', 'login', 'login', 'note', 'card', 'identity'];
const SEED_FOLDERS = ['Seed: Work', 'Seed: Family', 'Seed: Shopping'].map((name, i) => ({
  id: `${SEED_FOLDER_PREFIX}${i + 1}`,
  name,
}));

export function makeSeedEntry(index: number, now: number): Entry {
  const n = String(index + 1).padStart(4, '0');
  const type = TYPES[index % TYPES.length]!;
  const entry: Entry = {
    id: `${SEED_PREFIX}${n}`,
    type,
    title: `Seed ${type === 'login' ? 'Site' : type} ${n}`,
    username: type === 'login' ? `user${n}@example.com` : '',
    password: type === 'login' ? `seed-password-${n}` : '',
    urls: type === 'login' ? [`https://site${n}.example.com`] : [],
    notes: index % 5 === 0 ? `Fake note for entry ${n}` : '',
    customFields:
      index % 7 === 0 ? [{ id: `f${n}`, label: 'Question', value: 'Blue', hidden: true }] : [],
    favorite: index % 20 === 0,
    createdAt: now - index * 60_000,
    updatedAt: now - index * 30_000,
    passwordHistory: [],
  };
  if (index % 4 === 0) entry.folderId = SEED_FOLDERS[index % SEED_FOLDERS.length]!.id;
  if (type === 'card') {
    entry.card = {
      holder: 'Seed Person',
      number: '4242424242424242',
      expiry: '09/30',
      cvv: '123',
      pin: '',
    };
  }
  if (type === 'identity') {
    entry.identity = {
      fullName: `Seed Person ${n}`,
      email: `p${n}@example.com`,
      phone: '',
      address: '',
    };
  }
  return entry;
}

export function withSeedEntries(data: VaultData, count: number, now: number): VaultData {
  const kept = data.entries.filter((e) => !e.id.startsWith(SEED_PREFIX));
  const seeded = Array.from({ length: count }, (_, i) => makeSeedEntry(i, now));
  const otherFolders = data.folders.filter((f) => !f.id.startsWith(SEED_FOLDER_PREFIX));
  return { ...data, entries: [...kept, ...seeded], folders: [...otherFolders, ...SEED_FOLDERS] };
}

export function withoutSeedEntries(data: VaultData): VaultData {
  return {
    ...data,
    entries: data.entries.filter((e) => !e.id.startsWith(SEED_PREFIX)),
    folders: data.folders.filter((f) => !f.id.startsWith(SEED_FOLDER_PREFIX)),
  };
}
