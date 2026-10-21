export type BackupErrorKind =
  | 'unavailable' // cloud backup is not switched on in this build
  | 'cancelled' // the user closed the Google sign-in
  | 'not-signed-in'
  | 'scope-denied' // signed in, but the Drive permission was not granted
  | 'access-revoked' // the user removed KiteVault's access in their Google account
  | 'auth-expired' // the sign-in is no longer valid and could not be refreshed
  | 'offline'
  | 'quota' // the Google Drive is full
  | 'rate-limited'
  | 'server'
  | 'not-found'
  | 'invalid-backup' // downloaded, but not a usable KiteVault file
  | 'conflict' // the cloud already holds a different backup
  | 'no-vault'
  | 'play-services'
  | 'setup-error' // package name / signing key do not match the Google Cloud setup
  | 'busy'
  | 'unknown';

// Carries only a kind and, for Drive replies, the HTTP status. Never a token, a response body
// or anything from the vault.
export class BackupError extends Error {
  readonly kind: BackupErrorKind;
  readonly status?: number;

  constructor(kind: BackupErrorKind, status?: number) {
    super(`Backup error: ${kind}`);
    this.name = 'BackupError';
    this.kind = kind;
    this.status = status;
  }
}

const MESSAGES: Record<BackupErrorKind, string> = {
  unavailable: 'Cloud backup is not available in this version of the app.',
  cancelled: 'Google sign-in was cancelled.',
  'not-signed-in': 'You are signed out of Google. Sign in again to keep backing up.',
  'scope-denied':
    'KiteVault needs permission to use its own hidden folder in your Google Drive. Sign in again and allow it.',
  'access-revoked':
    'KiteVault no longer has access to your Google Drive (it may have been removed in your Google account). Sign in again to continue.',
  'auth-expired': 'Your Google sign-in has expired. Sign in again.',
  offline: 'No internet connection. Check your connection and try again.',
  quota: 'Your Google Drive is full. Free up some space and try again.',
  'rate-limited': 'Google asked KiteVault to slow down. Try again in a few minutes.',
  server: 'Google Drive had a problem. Try again in a few minutes.',
  'not-found': 'The backup was not found in your Google Drive.',
  'invalid-backup': 'The backup is damaged, or was made by a newer version of KiteVault.',
  conflict:
    'Your Google account already holds a backup that this phone did not make, or that changed since this phone last backed up.',
  'no-vault': 'There is no vault on this phone to back up.',
  'play-services': 'Google Play services is missing or needs an update.',
  'setup-error':
    'Google sign-in is not set up correctly for this build: the package name or signing key does not match the Google Cloud project.',
  busy: 'Another backup operation is already running.',
  unknown: 'Something went wrong with the cloud backup. Please try again.',
};

export function describeBackupError(error: unknown): string {
  const kind = error instanceof BackupError ? error.kind : 'unknown';
  return MESSAGES[kind];
}

export function backupErrorKind(error: unknown): BackupErrorKind {
  return error instanceof BackupError ? error.kind : 'unknown';
}
