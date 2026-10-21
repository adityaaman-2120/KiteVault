import type { Entry, EntryType } from '@/vault';

export type EntryFilter = {
  query: string;
  type: EntryType | null;
  favoritesOnly: boolean;
  // null = every folder, '' = entries that are in no folder
  folderId: string | null;
};

export const NO_FILTER: EntryFilter = {
  query: '',
  type: null,
  favoritesOnly: false,
  folderId: null,
};

// Entries are replaced (never edited in place) when they change, so a WeakMap keyed by the
// entry object is a safe cache: the lowercase search text is built once per entry version.
const searchTextCache = new WeakMap<Entry, string>();

function searchText(entry: Entry): string {
  let text = searchTextCache.get(entry);
  if (text === undefined) {
    text = [entry.title, entry.username, ...entry.urls].join('\n').toLowerCase();
    searchTextCache.set(entry, text);
  }
  return text;
}

// Splits "foo bar" into ["foo", "bar"]; an entry must contain every word (title, username or url).
function words(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

export function filterEntries(entries: readonly Entry[], filter: EntryFilter): Entry[] {
  const terms = words(filter.query);
  return entries.filter((entry) => {
    if (filter.type && entry.type !== filter.type) return false;
    if (filter.favoritesOnly && !entry.favorite) return false;
    if (filter.folderId !== null && (entry.folderId ?? '') !== filter.folderId) return false;
    if (terms.length === 0) return true;
    const text = searchText(entry);
    return terms.every((term) => text.includes(term));
  });
}

const sortKeyCache = new WeakMap<Entry, string>();
function sortKey(entry: Entry): string {
  let key = sortKeyCache.get(entry);
  if (key === undefined) {
    key = entry.title.toLowerCase();
    sortKeyCache.set(entry, key);
  }
  return key;
}

// Favorites first, then A-Z by title. Returns a new array.
export function sortEntries(entries: readonly Entry[]): Entry[] {
  return [...entries].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    const ka = sortKey(a);
    const kb = sortKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}
