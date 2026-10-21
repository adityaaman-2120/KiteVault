export type VaultErrorCode =
  | 'NO_VAULT'
  | 'VAULT_EXISTS'
  | 'LOCKED'
  | 'WRONG_PASSWORD'
  | 'WRONG_KEY'
  | 'CORRUPTED'
  | 'UNSUPPORTED_VERSION'
  | 'INVALID_INPUT';

// Messages never contain passwords, keys, or vault contents.
export class VaultError extends Error {
  readonly code: VaultErrorCode;

  constructor(code: VaultErrorCode, message: string) {
    super(message);
    this.name = 'VaultError';
    this.code = code;
  }
}
