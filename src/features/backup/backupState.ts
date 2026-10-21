import { create } from 'zustand';

import type { BackupErrorKind } from './errors';

// What the Settings card shows right now. Nothing here is a secret and none of it is saved.
export type BackupUiState = {
  email: string | null;
  busy: 'idle' | 'signing-in' | 'backing-up' | 'deleting';
  // The last problem, shown until the next attempt succeeds.
  error: BackupErrorKind | null;
  // The cloud holds a different backup than the one this phone last uploaded to.
  conflict: boolean;
};

export const useBackupState = create<BackupUiState>(() => ({
  email: null,
  busy: 'idle',
  error: null,
  conflict: false,
}));
