import Papa from 'papaparse';

import { newId } from '@/features/entries/model';
import { paramsToStore, parseTotpInput } from '@/features/totp/totp';
import type { CustomField, EntryType } from '@/vault';

import { ImportError, type ImportedEntry, type ImportFormat, type ParsedImport } from './types';

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

function blank(type: EntryType, title: string, now: number): ImportedEntry {
  return {
    type,
    title,
    username: '',
    password: '',
    urls: [],
    notes: '',
    customFields: [],
    favorite: false,
    createdAt: now,
    updatedAt: now,
    passwordHistory: [],
  };
}

// A title for sites exported without a name: the address without "https://" and the path.
function titleFromUrl(url: string): string {
  return url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[/?#]/)[0] ?? '';
}

// Bitwarden stores the authenticator secret either bare or as an otpauth:// link.
function totpSecret(value: string): string | undefined {
  const text = value.trim();
  if (!text) return undefined;
  const match = /[?&]secret=([^&]+)/i.exec(text);
  const secret = (match ? decodeURIComponent(match[1]!) : text).replace(/\s+/g, '');
  return secret || undefined;
}

// Keeps the secret and, for a link, its settings (digits, period, algorithm). A value that is not
// a valid secret is kept as typed, so importing never loses data; the entry then says it is invalid.
function applyTotp(entry: ImportedEntry, value: string): void {
  try {
    const parsed = parseTotpInput(value);
    entry.totpSecret = parsed.secret;
    const params = paramsToStore(parsed.params);
    if (params) entry.totpParams = params;
  } catch {
    const secret = totpSecret(value);
    if (secret) entry.totpSecret = secret;
  }
}

const validTime = (value: unknown, fallback: number): number => {
  const time = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(time) && time > 0 ? time : fallback;
};

// --- CSV ---------------------------------------------------------------------------------------

type Row = Record<string, string>;

function readCsv(text: string): { columns: string[]; rows: Row[] } {
  const result = Papa.parse<Row>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim().toLowerCase(),
  });
  // Papa reports short or long rows as "errors" but still returns them; the rows are used as is.
  return { columns: result.meta.fields ?? [], rows: result.data };
}

const hasColumns = (columns: string[], ...wanted: string[]) =>
  wanted.every((name) => columns.includes(name));

export function detectCsv(columns: string[]): ImportFormat | null {
  if (hasColumns(columns, 'login_uri', 'login_username', 'login_password')) return 'bitwarden-csv';
  if (
    hasColumns(columns, 'username', 'password') &&
    (columns.includes('url') || columns.includes('name'))
  ) {
    return 'chrome-csv';
  }
  return null;
}

function parseChromeRow(row: Row, now: number): ImportedEntry | null {
  const url = clean(row.url);
  const title = clean(row.name) || titleFromUrl(url);
  const entry = blank('login', title, now);
  entry.username = row.username ?? '';
  entry.password = row.password ?? '';
  entry.urls = url ? [url] : [];
  entry.notes = row.note ?? '';
  if (!title && !entry.username && !entry.password) return null;
  if (!title) entry.title = '(no name)';
  return entry;
}

// Bitwarden writes custom fields as one "name: value" per line.
function parseFieldLines(text: string): CustomField[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const at = line.indexOf(': ');
      return {
        id: newId(),
        label: at > 0 ? line.slice(0, at) : 'Field',
        value: at > 0 ? line.slice(at + 2) : line,
        hidden: false,
      };
    });
}

function parseBitwardenRow(row: Row, now: number): ImportedEntry | null {
  const isNote = clean(row.type).toLowerCase() === 'note';
  const entry = blank(isNote ? 'note' : 'login', clean(row.name), now);
  entry.notes = row.notes ?? '';
  entry.favorite = ['1', 'true'].includes(clean(row.favorite).toLowerCase());
  entry.customFields = parseFieldLines(row.fields ?? '');
  const folder = clean(row.folder);
  if (folder) entry.folderName = folder;
  if (!isNote) {
    entry.username = row.login_username ?? '';
    entry.password = row.login_password ?? '';
    entry.urls = (row.login_uri ?? '')
      .split(/\r?\n/)
      .map((u) => u.trim())
      .filter(Boolean);
    applyTotp(entry, row.login_totp ?? '');
  }
  if (!entry.title) entry.title = titleFromUrl(entry.urls[0] ?? '') || '(no name)';
  const empty = !entry.username && !entry.password && !entry.notes && entry.urls.length === 0;
  return empty && !clean(row.name) ? null : entry;
}

// --- Bitwarden JSON ----------------------------------------------------------------------------

type BwField = { name?: unknown; value?: unknown; type?: unknown };
type BwItem = {
  type?: unknown;
  name?: unknown;
  notes?: unknown;
  favorite?: unknown;
  folderId?: unknown;
  fields?: unknown;
  login?: { username?: unknown; password?: unknown; totp?: unknown; uris?: unknown };
  card?: Record<string, unknown>;
  identity?: Record<string, unknown>;
  creationDate?: unknown;
  revisionDate?: unknown;
  deletedDate?: unknown;
};

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

function bitwardenItem(
  item: BwItem,
  folders: Map<string, string>,
  now: number,
): ImportedEntry | null {
  const kind = item.type;
  const type: EntryType =
    kind === 1 ? 'login' : kind === 3 ? 'card' : kind === 4 ? 'identity' : 'note';
  const entry = blank(type, clean(item.name), now);
  entry.notes = str(item.notes);
  entry.favorite = item.favorite === true;
  entry.createdAt = validTime(item.creationDate, now);
  entry.updatedAt = validTime(item.revisionDate, entry.createdAt);
  if (item.deletedDate) entry.deletedAt = validTime(item.deletedDate, now);
  const folder = folders.get(str(item.folderId));
  if (folder) entry.folderName = folder;

  if (Array.isArray(item.fields)) {
    entry.customFields = (item.fields as BwField[])
      .filter((f) => f && typeof f === 'object')
      .map((f) => ({
        id: newId(),
        label: str(f.name),
        // Bitwarden's "boolean" fields hold the text "true" or "false".
        value: str(f.value),
        hidden: f.type === 1,
      }));
  }

  if (type === 'login' && item.login) {
    entry.username = str(item.login.username);
    entry.password = str(item.login.password);
    applyTotp(entry, str(item.login.totp));
    if (Array.isArray(item.login.uris)) {
      entry.urls = (item.login.uris as { uri?: unknown }[])
        .map((u) => clean(u?.uri))
        .filter(Boolean);
    }
  }
  if (type === 'card' && item.card) {
    const c = item.card;
    const month = str(c.expMonth) ? str(c.expMonth).padStart(2, '0') : '';
    const year = str(c.expYear).slice(-2);
    entry.card = {
      holder: str(c.cardholderName),
      number: str(c.number),
      // A missing month or year stays empty instead of becoming "00".
      expiry: month || year ? `${month}/${year}` : '',
      cvv: str(c.code),
      pin: '',
    };
  }
  if (type === 'identity' && item.identity) {
    const i = item.identity;
    const join = (parts: unknown[], glue: string) => parts.map(str).filter(Boolean).join(glue);
    entry.identity = {
      fullName: join([i.title, i.firstName, i.middleName, i.lastName], ' '),
      email: str(i.email),
      phone: str(i.phone),
      address: join(
        [i.address1, i.address2, i.address3, i.city, i.state, i.postalCode, i.country],
        ', ',
      ),
    };
  }
  if (!entry.title) entry.title = titleFromUrl(entry.urls[0] ?? '') || '(no name)';
  return entry;
}

function parseBitwardenJson(value: unknown, now: number): ParsedImport | null {
  const root = value as { encrypted?: unknown; items?: unknown; folders?: unknown } | null;
  if (typeof root !== 'object' || root === null) return null;
  // An encrypted export has no readable "items", only a blob.
  if (root.encrypted === true) throw new ImportError('encrypted-bitwarden');
  if (!Array.isArray(root.items)) return null;

  const folders = new Map<string, string>();
  if (Array.isArray(root.folders)) {
    for (const f of root.folders as { id?: unknown; name?: unknown }[]) {
      if (f && typeof f.id === 'string' && clean(f.name)) folders.set(f.id, clean(f.name));
    }
  }
  const entries: ImportedEntry[] = [];
  let skipped = 0;
  for (const item of root.items as BwItem[]) {
    const entry = item && typeof item === 'object' ? bitwardenItem(item, folders, now) : null;
    if (entry) entries.push(entry);
    else skipped++;
  }
  return { format: 'bitwarden-json', entries, skipped };
}

// --- entry point -------------------------------------------------------------------------------

// Works out which format `text` is in and reads it. Throws ImportError for anything else.
export function parsePlainImport(text: string, now: number = Date.now()): ParsedImport {
  const trimmed = text.replace(/^﻿/, '').trim();
  if (trimmed.startsWith('{')) {
    let json: unknown;
    try {
      json = JSON.parse(trimmed);
    } catch {
      throw new ImportError('unknown-format');
    }
    const parsed = parseBitwardenJson(json, now);
    if (!parsed) throw new ImportError('unknown-format');
    if (parsed.entries.length === 0) throw new ImportError('empty');
    return parsed;
  }

  const { columns, rows } = readCsv(trimmed);
  const format = detectCsv(columns);
  if (!format) throw new ImportError('unknown-format');
  const read = format === 'chrome-csv' ? parseChromeRow : parseBitwardenRow;
  const entries: ImportedEntry[] = [];
  let skipped = 0;
  for (const row of rows) {
    const entry = read(row, now);
    if (entry) entries.push(entry);
    else skipped++;
  }
  if (entries.length === 0) throw new ImportError('empty');
  return { format, entries, skipped };
}
