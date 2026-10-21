import { generateRandomBytes } from '@/crypto';
import type { Entry, EntryType, VaultData } from '@/vault';

export const TRASH_RETENTION_DAYS = 30;
export const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
export const MAX_PASSWORD_HISTORY = 10;

export const ENTRY_TYPES: readonly { value: EntryType; label: string }[] = [
  { value: 'login', label: 'Login' },
  { value: 'note', label: 'Secure note' },
  { value: 'card', label: 'Card' },
  { value: 'identity', label: 'Identity' },
];

export const typeLabel = (type: EntryType): string =>
  ENTRY_TYPES.find((t) => t.value === type)?.label ?? type;

// Random 128-bit id from the secure generator (never Math.random()).
export function newId(): string {
  return Array.from(generateRandomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
}

export const isTrashed = (entry: Entry): boolean => entry.deletedAt !== undefined;

export function trashExpiresAt(entry: Entry): number {
  return (entry.deletedAt ?? 0) + TRASH_RETENTION_MS;
}

// Whole days left before a trashed entry is deleted for good (at least 0).
export function trashDaysLeft(entry: Entry, now: number): number {
  return Math.max(0, Math.ceil((trashExpiresAt(entry) - now) / (24 * 60 * 60 * 1000)));
}

export const isExpiredInTrash = (entry: Entry, now: number): boolean =>
  isTrashed(entry) && now >= trashExpiresAt(entry);

// Returns the same object when nothing has expired, so callers can skip saving.
export function purgeExpiredTrash(data: VaultData, now: number): VaultData {
  if (!data.entries.some((e) => isExpiredInTrash(e, now))) return data;
  return { ...data, entries: data.entries.filter((e) => !isExpiredInTrash(e, now)) };
}

export const activeEntries = (data: VaultData): Entry[] =>
  data.entries.filter((e) => !isTrashed(e));

export const trashedEntries = (data: VaultData, now: number): Entry[] =>
  data.entries.filter((e) => isTrashed(e) && !isExpiredInTrash(e, now));
