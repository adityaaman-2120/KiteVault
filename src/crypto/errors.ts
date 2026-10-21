export type CryptoErrorCode = 'INVALID_INPUT' | 'DECRYPT_FAILED' | 'KDF_FAILED' | 'RANDOM_FAILED';

// Messages never include keys, plaintext, or other secret material.
export class CryptoError extends Error {
  readonly code: CryptoErrorCode;

  constructor(code: CryptoErrorCode, message: string) {
    super(message);
    this.name = 'CryptoError';
    this.code = code;
  }
}
