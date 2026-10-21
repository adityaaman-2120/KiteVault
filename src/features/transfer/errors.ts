import { formatWait } from '@/features/lock/UnlockForm';
import { LockoutError } from '@/features/lock/unlockService';
import { VaultError } from '@/vault';

import { ExportError } from './exportFiles';
import { IMPORT_ERROR_TEXT, ImportError } from './types';

export function describeTransferError(error: unknown): string {
  if (error instanceof LockoutError) {
    return `Too many wrong attempts. Try again in ${formatWait(error.remainingMs)}.`;
  }
  if (error instanceof ImportError) return IMPORT_ERROR_TEXT[error.code];
  if (error instanceof ExportError) {
    return error.code === 'sharing-unavailable'
      ? 'Sharing is not available on this phone.'
      : 'There is no vault to export.';
  }
  if (error instanceof VaultError) {
    if (error.code === 'WRONG_PASSWORD') return 'That master password is wrong.';
    if (error.code === 'LOCKED') return 'The vault is locked. Unlock it and try again.';
    if (error.code === 'CORRUPTED' || error.code === 'UNSUPPORTED_VERSION') {
      return 'This file is damaged, or was made by a different version of KiteVault.';
    }
  }
  return 'Something went wrong, and nothing was changed. Please try again.';
}
