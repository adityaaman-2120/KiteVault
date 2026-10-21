import Papa from 'papaparse';

import { isTrashed } from '@/features/entries/model';
import type { Entry, VaultData } from '@/vault';

// Bitwarden's CSV layout: it holds logins and notes with their extra fields, and Bitwarden,
// KiteVault and most other managers can read it.
export const CSV_COLUMNS = [
  'folder',
  'favorite',
  'type',
  'name',
  'notes',
  'fields',
  'reprompt',
  'login_uri',
  'login_username',
  'login_password',
  'login_totp',
] as const;

export const CSV_NOT_ENCRYPTED_WARNING =
  'This file is NOT encrypted. Every password in it can be read by anyone or any app that can open the file. Delete it as soon as you have used it, and do not send it by email or chat or put it in cloud storage.';

const line = (label: string, value: string) => `${label}: ${value}`;

// Cards and identities have no place in this layout, so they become notes with their details as
// text. Nothing is left out.
function detailLines(entry: Entry): string[] {
  const { card, identity } = entry;
  if (entry.type === 'card' && card) {
    return [
      line('Card holder', card.holder),
      line('Card number', card.number),
      line('Expiry', card.expiry),
      line('Security code', card.cvv),
      line('PIN', card.pin),
    ];
  }
  if (entry.type === 'identity' && identity) {
    return [
      line('Full name', identity.fullName),
      line('Email', identity.email),
      line('Phone', identity.phone),
      line('Address', identity.address),
    ];
  }
  return [];
}

// The entries that would be exported: everything except what is in the Trash.
export const exportableEntries = (data: VaultData): Entry[] =>
  data.entries.filter((entry) => !isTrashed(entry));

export function entriesToCsv(data: VaultData): string {
  const folderName = new Map(data.folders.map((f) => [f.id, f.name]));
  const rows = exportableEntries(data).map((entry) => {
    const isLogin = entry.type === 'login';
    const details = detailLines(entry);
    const notes = [entry.notes, ...details].filter((part) => part !== '').join('\n');
    return [
      (entry.folderId && folderName.get(entry.folderId)) || '',
      entry.favorite ? '1' : '',
      isLogin ? 'login' : 'note',
      entry.title,
      notes,
      entry.customFields.map((f) => line(f.label, f.value)).join('\n'),
      '0',
      isLogin ? entry.urls.join('\n') : '',
      isLogin ? entry.username : '',
      isLogin ? entry.password : '',
      isLogin ? (entry.totpSecret ?? '') : '',
    ];
  });
  return Papa.unparse({ fields: [...CSV_COLUMNS], data: rows }, { newline: '\r\n' });
}
