import type { Entry, VaultData } from '@/vault';

import { exportableEntries, totpCell } from './csvExport';

// Bitwarden's unencrypted JSON layout. It keeps cards, identities, folders, dates and custom
// fields, which the CSV cannot. Bitwarden, KiteVault and several other managers can read it.
const TYPE_CODE = { login: 1, note: 2, card: 3, identity: 4 } as const;

const iso = (time: number) => new Date(time).toISOString();

// "MM/YY" -> Bitwarden's separate month and four-digit year.
function splitExpiry(expiry: string): { month: string; year: string } {
  const match = /^\s*(\d{1,2})\s*\/\s*(\d{2}|\d{4})\s*$/.exec(expiry);
  if (!match) return { month: '', year: '' };
  const year = match[2]!.length === 2 ? `20${match[2]}` : match[2]!;
  return { month: String(Number(match[1])), year };
}

function toItem(entry: Entry) {
  const fields = entry.customFields.map((f) => ({
    name: f.label,
    value: f.value,
    type: f.hidden ? 1 : 0,
    linkedId: null,
  }));
  // Bitwarden's card has no PIN column; keep it as a hidden field so nothing is dropped.
  if (entry.type === 'card' && entry.card?.pin) {
    fields.push({ name: 'PIN', value: entry.card.pin, type: 1, linkedId: null });
  }

  const { card, identity } = entry;
  const expiry = splitExpiry(card?.expiry ?? '');
  return {
    id: entry.id,
    organizationId: null,
    folderId: entry.folderId ?? null,
    type: TYPE_CODE[entry.type],
    reprompt: 0,
    name: entry.title,
    notes: entry.notes === '' ? null : entry.notes,
    favorite: entry.favorite,
    fields,
    login:
      entry.type === 'login'
        ? {
            uris: entry.urls.map((uri) => ({ match: null, uri })),
            username: entry.username,
            password: entry.password,
            totp: totpCell(entry) || null,
          }
        : undefined,
    secureNote: entry.type === 'note' ? { type: 0 } : undefined,
    card:
      entry.type === 'card' && card
        ? {
            cardholderName: card.holder,
            brand: null,
            number: card.number,
            expMonth: expiry.month,
            expYear: expiry.year,
            code: card.cvv,
          }
        : undefined,
    identity:
      entry.type === 'identity' && identity
        ? {
            // KiteVault keeps one full-name field, so it goes into the first name.
            firstName: identity.fullName,
            email: identity.email,
            phone: identity.phone,
            address1: identity.address,
          }
        : undefined,
    collectionIds: null,
    revisionDate: iso(entry.updatedAt),
    creationDate: iso(entry.createdAt),
    deletedDate: null,
  };
}

export function entriesToBitwardenJson(data: VaultData): string {
  const items = exportableEntries(data);
  const usedFolders = new Set(items.map((e) => e.folderId));
  const folders = data.folders.filter((f) => usedFolders.has(f.id));
  return JSON.stringify({ encrypted: false, folders, items: items.map(toItem) }, null, 2);
}
