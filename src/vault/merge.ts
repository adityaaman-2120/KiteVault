import { sha256, utf8Encode } from '@/crypto';

import type { AppLink, Entry, Folder, PasswordHistoryItem, VaultData } from './types';

// Merges two copies of the same vault that were changed on two devices. Pure and deterministic:
// no network, no clock, no randomness, so the same two inputs always give the same result.
//
// The rules, in order of importance:
//   1. NOTHING IS SILENTLY LOST. An entry that is on only one side is kept. A deleted entry goes
//      to (or stays in) the Trash, never straight out of the vault. A password that is replaced
//      goes into the password history. If both sides changed the same entry and the changes
//      cannot be told apart from a plain update, the older version is kept as a separate
//      "conflicting copy" entry.
//   2. For an entry on both sides, the newest `updatedAt` wins.
//   3. Delete versus edit: whichever happened LATER wins. A deletion (`deletedAt`) only beats an
//      edit that was made before it; an edit made after the deletion brings the entry back.
//
// Known limit: an entry that was deleted FOR GOOD (emptied from the Trash) on one device and is
// still present on the other cannot be told apart from an entry that was added on the other
// device, so it comes back. That is the safe direction. Settings are kept from the local side.

const HISTORY_LIMIT = 10;
const COPY_SUFFIX = ' (conflicting copy)';

export type MergeOptions = {
  // When the two sides last had the same content (epoch ms, for example the time of the last
  // backup this device made or restored). An entry that only ONE side changed since then is a
  // plain update, so the older version is not kept as a copy. Without it, every disagreement
  // between two different versions is treated as a possible conflict and keeps a copy.
  baseTime?: number;
};

export type MergeSummary = {
  keptHereOnly: number; // only on this device: kept
  addedFromCloud: number; // only in the cloud: added here
  tookCloud: number; // on both, the cloud version was newer
  keptLocal: number; // on both, this device's version was newer or the same
  conflictingCopies: number; // older version kept as an extra entry
  restoredFromTrash: number; // deleted on one side, edited later on the other: kept alive
  keptInTrash: number; // deleted on one side after the other's last edit: in the Trash
  foldersAdded: number;
};

export type MergeResult = { data: VaultData; summary: MergeSummary };

// Stable text for any JSON value, with object keys sorted, so equal data gives equal text.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

// Everything about an entry except the bookkeeping that legitimately differs between devices.
function content(entry: Entry): string {
  const rest: Partial<Entry> = { ...entry };
  delete rest.updatedAt;
  delete rest.passwordHistory;
  delete rest.deletedAt;
  delete rest.appLinks; // links are combined, not a reason for a conflicting copy
  return canonical(rest);
}

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

// Same loser content gives the same id, so merging the same two vaults twice adds one copy, not two.
function copyId(original: Entry): string {
  return hex(sha256(utf8Encode(`conflict:${original.id}:${canonical(original)}`)).slice(0, 16));
}

function mergeHistory(winner: Entry, loser: Entry): PasswordHistoryItem[] {
  const items = [...winner.passwordHistory, ...loser.passwordHistory];
  // The loser's current password must not vanish when the winner has another one.
  if (loser.password && loser.password !== winner.password) {
    items.push({ password: loser.password, changedAt: loser.updatedAt });
  }
  const seen = new Set<string>();
  return items
    .filter((item) => {
      const key = `${item.changedAt}:${item.password}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return item.password !== winner.password;
    })
    .sort((a, b) => b.changedAt - a.changedAt)
    .slice(0, HISTORY_LIMIT);
}

function withHistory(entry: Entry, history: PasswordHistoryItem[]): Entry {
  return { ...entry, passwordHistory: history };
}

export function mergeVaults(
  local: VaultData,
  remote: VaultData,
  options: MergeOptions = {},
): MergeResult {
  if (local.version !== remote.version) {
    throw new RangeError('Cannot merge vaults with different data versions.');
  }
  const summary: MergeSummary = {
    keptHereOnly: 0,
    addedFromCloud: 0,
    tookCloud: 0,
    keptLocal: 0,
    conflictingCopies: 0,
    restoredFromTrash: 0,
    keptInTrash: 0,
    foldersAdded: 0,
  };

  const localById = new Map(local.entries.map((e) => [e.id, e]));
  const remoteById = new Map(remote.entries.map((e) => [e.id, e]));
  const ids = [
    ...localById.keys(),
    ...remote.entries.map((e) => e.id).filter((id) => !localById.has(id)),
  ];

  const merged = new Map<string, Entry>();
  const copies: Entry[] = [];

  for (const id of ids) {
    const l = localById.get(id);
    const r = remoteById.get(id);
    if (l && !r) {
      merged.set(id, l);
      summary.keptHereOnly++;
      continue;
    }
    if (r && !l) {
      merged.set(id, r);
      summary.addedFromCloud++;
      continue;
    }
    const both = resolve(l!, r!, options, summary, copies);
    merged.set(id, both);
  }

  // Conflicting copies go in last, and only once: the same loser content always gets the same id.
  for (const copy of copies) {
    if (!merged.has(copy.id)) {
      merged.set(copy.id, copy);
      summary.conflictingCopies++;
    }
  }

  // Folders: everything from both sides. Same id keeps this device's name; a different folder that
  // happens to have the same name gets a suffix so names stay unique.
  const folders: Folder[] = [...local.folders];
  const taken = new Set(folders.map((f) => f.name.toLowerCase()));
  const folderIds = new Set(folders.map((f) => f.id));
  for (const folder of remote.folders) {
    if (folderIds.has(folder.id)) continue;
    let name = folder.name;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${folder.name} (${n})`;
    taken.add(name.toLowerCase());
    folderIds.add(folder.id);
    folders.push({ id: folder.id, name });
    summary.foldersAdded++;
  }

  return {
    data: { ...local, entries: [...merged.values()], folders },
    summary,
  };
}

// Apps linked for autofill on either device stay linked.
function unionLinks(l: Entry, r: Entry): AppLink[] | undefined {
  const all = [...(l.appLinks ?? []), ...(r.appLinks ?? [])];
  if (all.length === 0) return undefined;
  const seen = new Set<string>();
  return all.filter((link) => {
    const key = `${link.packageName}:${link.certSha256.replace(/:/g, '').toUpperCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolve(
  l: Entry,
  r: Entry,
  options: MergeOptions,
  summary: MergeSummary,
  copies: Entry[],
): Entry {
  const result = resolveEntry(l, r, options, summary, copies);
  const links = unionLinks(l, r);
  return links ? { ...result, appLinks: links } : result;
}

// An entry that exists on both sides, and is not identical.
function resolveEntry(
  l: Entry,
  r: Entry,
  options: MergeOptions,
  summary: MergeSummary,
  copies: Entry[],
): Entry {
  if (canonical(l) === canonical(r)) {
    summary.keptLocal++;
    return l;
  }
  const lDeleted = l.deletedAt !== undefined;
  const rDeleted = r.deletedAt !== undefined;

  // Newest edit wins; on a tie this device's version.
  const cloudNewer = r.updatedAt > l.updatedAt;
  const winner = cloudNewer ? r : l;
  const loser = cloudNewer ? l : r;

  // --- deletion versus edit -------------------------------------------------------------
  if (lDeleted !== rDeleted) {
    const deleted = lDeleted ? l : r;
    const live = lDeleted ? r : l;
    if (live.updatedAt > deleted.deletedAt!) {
      // Edited (or restored) after it was deleted: it lives, with the live side's content.
      summary.restoredFromTrash++;
      const result = withHistory({ ...live }, mergeHistory(live, deleted));
      delete result.deletedAt;
      return result;
    }
    // Deleted after the last edit: it stays in the Trash. Keep the newest content inside it so no
    // edit is lost; the deletion time is the deleted side's.
    summary.keptInTrash++;
    const newest = deleted.updatedAt >= live.updatedAt ? deleted : live;
    const other = newest === deleted ? live : deleted;
    return withHistory({ ...newest, deletedAt: deleted.deletedAt }, mergeHistory(newest, other));
  }

  // --- both deleted, or both live ---------------------------------------------------------
  if (cloudNewer) summary.tookCloud++;
  else summary.keptLocal++;

  const history = mergeHistory(winner, loser);
  let result = withHistory({ ...winner }, history);

  if (lDeleted && rDeleted) {
    // Both are in the Trash: keep the later deletion time so the 30 days run from the later one.
    result = { ...result, deletedAt: Math.max(l.deletedAt!, r.deletedAt!) };
    return result;
  }

  // Both live. Was it changed on BOTH sides since they last agreed? Then keep the loser too.
  const { baseTime } = options;
  const concurrent = baseTime === undefined || (l.updatedAt > baseTime && r.updatedAt > baseTime);
  if (concurrent && content(l) !== content(r)) {
    copies.push({
      ...loser,
      id: copyId(loser),
      title: `${loser.title}${COPY_SUFFIX}`,
      favorite: false,
    });
  }
  return result;
}
