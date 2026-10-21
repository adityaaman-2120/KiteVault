import { create } from 'zustand';

import type { RemoteBackup } from './driveApi';
import type { BackupErrorKind } from './errors';

// Why the cloud copy cannot simply be overwritten:
//   unrelated    the cloud holds a backup this phone never saw (new vault, reinstall, other phone)
//   remote-ahead the cloud changed since this phone last looked, and this phone has nothing new
//   diverged     the cloud changed AND this phone has changes of its own
export type ConflictRelation = 'unrelated' | 'remote-ahead' | 'diverged';

export type ConflictInfo = {
  relation: ConflictRelation;
  remote: RemoteBackup; // the newest version in the cloud
  localRevision: number;
  seenRevision: number; // the revision this phone last uploaded or downloaded
};

// What the Settings card shows right now. Nothing here is a secret and none of it is saved.
export type BackupUiState = {
  email: string | null;
  busy: 'idle' | 'signing-in' | 'backing-up' | 'deleting';
  // The last problem, shown until the next attempt succeeds.
  error: BackupErrorKind | null;
  // Set while the cloud copy and this phone disagree and the user has to choose.
  conflict: ConflictInfo | null;
};

export const useBackupState = create<BackupUiState>(() => ({
  email: null,
  busy: 'idle',
  error: null,
  conflict: null,
}));
