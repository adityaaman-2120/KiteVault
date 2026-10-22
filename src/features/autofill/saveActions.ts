import { EntryActionError, mutateVault, replaceEntry } from '@/features/entries/entryActions';
import { MAX_PASSWORD_HISTORY, newId } from '@/features/entries/model';
import type { PendingSave } from '@/native/keystore/autofill';
import type { AppLink, Entry } from '@/vault';

import { normalizeCert } from './saveMatching';

// The app link for an app origin (autofill matches apps by package name + certificate).
function linkOf(save: PendingSave): AppLink | null {
  const o = save.origin;
  return o.kind === 'app'
    ? { packageName: o.packageName, certSha256: normalizeCert(o.certSha256) }
    : null;
}

const hasLink = (entry: Entry, link: AppLink) =>
  (entry.appLinks ?? []).some(
    (l) => l.packageName === link.packageName && normalizeCert(l.certSha256) === link.certSha256,
  );

export type NewLoginOptions = {
  title: string;
  folderId?: string; // '' or undefined = no folder
};

// Saves a waiting login as a NEW entry. Web logins get their address (https://host); app logins
// get an app link, which is what lets autofill recognise that app later.
export async function saveAsNewLogin(
  save: PendingSave,
  options: NewLoginOptions,
  now: () => number = Date.now,
): Promise<string> {
  const title = options.title.trim();
  if (!title) throw new EntryActionError('INVALID_ENTRY', 'Enter a title.');
  if (title.length > 100) throw new EntryActionError('INVALID_ENTRY', 'The title is too long.');
  let id = '';
  await mutateVault((data) => {
    if (options.folderId && !data.folders.some((f) => f.id === options.folderId)) {
      throw new EntryActionError('INVALID_FOLDER', 'That folder no longer exists.');
    }
    const time = now();
    const link = linkOf(save);
    id = newId();
    const entry: Entry = {
      id,
      type: 'login',
      title,
      username: save.username,
      password: save.password,
      urls: save.origin.kind === 'web' ? [`https://${save.origin.host}`] : [],
      notes: '',
      customFields: [],
      favorite: false,
      createdAt: time,
      updatedAt: time,
      passwordHistory: [],
      ...(options.folderId ? { folderId: options.folderId } : {}),
      ...(link ? { appLinks: [link] } : {}),
    };
    return { ...data, entries: [...data.entries, entry] };
  });
  return id;
}

// Replaces the password of an existing login and keeps the old one in its password history (newest
// first, at most 10), exactly like editing the entry by hand. An app origin also adds the app
// link if it is missing. If nothing would change, nothing is saved.
export function updateLoginPassword(
  entryId: string,
  save: PendingSave,
  now: () => number = Date.now,
): Promise<void> {
  return mutateVault((data) => {
    const existing = data.entries.find((e) => e.id === entryId);
    if (!existing) throw new EntryActionError('NOT_FOUND', 'This entry no longer exists.');
    const link = linkOf(save);
    const needsLink = link !== null && !hasLink(existing, link);
    const samePassword = existing.password === save.password;
    if (samePassword && !needsLink) return data;

    return replaceEntry(data, entryId, (entry) => {
      const time = now();
      const next: Entry = { ...entry, updatedAt: time };
      if (!samePassword) {
        next.password = save.password;
        next.passwordHistory = entry.password
          ? [{ password: entry.password, changedAt: time }, ...entry.passwordHistory].slice(
              0,
              MAX_PASSWORD_HISTORY,
            )
          : entry.passwordHistory;
      }
      if (link && needsLink) next.appLinks = [...(entry.appLinks ?? []), link];
      return next;
    });
  });
}
