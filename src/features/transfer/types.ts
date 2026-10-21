import type { Entry } from '@/vault';

// An entry read from a file, before it gets an id and a place in this vault.
export type ImportedEntry = Omit<Entry, 'id'> & { folderName?: string };

export type ImportFormat = 'chrome-csv' | 'bitwarden-csv' | 'bitwarden-json' | 'kvault';

export const FORMAT_LABELS: Record<ImportFormat, string> = {
  'chrome-csv': 'Chrome passwords (CSV)',
  'bitwarden-csv': 'Bitwarden (CSV)',
  'bitwarden-json': 'Bitwarden (JSON)',
  kvault: 'KiteVault backup (.kvault)',
};

// Plain-text formats leave a readable copy of every password on the phone.
export const isPlainFormat = (format: ImportFormat): boolean => format !== 'kvault';

export type ParsedImport = {
  format: ImportFormat;
  entries: ImportedEntry[];
  // Rows or items that held nothing usable and were left out.
  skipped: number;
};

export type ImportErrorCode =
  | 'unknown-format' // not a file we know
  | 'empty' // a known format, but no entries
  | 'encrypted-bitwarden' // a password-protected Bitwarden export
  | 'too-large';

export class ImportError extends Error {
  readonly code: ImportErrorCode;
  constructor(code: ImportErrorCode) {
    super(`Import error: ${code}`);
    this.name = 'ImportError';
    this.code = code;
  }
}

export const IMPORT_ERROR_TEXT: Record<ImportErrorCode, string> = {
  'unknown-format':
    'This file is not a format KiteVault can read. Use a Chrome passwords CSV, a Bitwarden CSV or JSON export, or a KiteVault .kvault file.',
  empty: 'The file was read, but it contains no passwords or notes.',
  'encrypted-bitwarden':
    'This Bitwarden export is password-protected. Export it again as an unencrypted .json or .csv, or import the .csv.',
  'too-large': 'This file is too large to import.',
};

export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
