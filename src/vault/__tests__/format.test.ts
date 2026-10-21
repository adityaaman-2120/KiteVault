import { generateRandomBytes, IV_LENGTH, TAG_LENGTH } from '@/crypto';

import { VaultError } from '..';
import {
  decodeVaultFile,
  encodeVaultFile,
  FORMAT_VERSION,
  isWellFormedVaultFile,
  type VaultHeader,
} from '../format';
import { FAST_KDF } from '../__support__/testUtils';

const header = (): VaultHeader => ({
  formatVersion: FORMAT_VERSION,
  kdf: FAST_KDF,
  salt: generateRandomBytes(16),
  wrappedKey: generateRandomBytes(60),
});
const body = () => generateRandomBytes(IV_LENGTH + 10 + TAG_LENGTH);

describe('vault file format', () => {
  test('round trips header and body', () => {
    const h = header();
    const b = body();
    const decoded = decodeVaultFile(encodeVaultFile(h, b));
    expect(decoded.header).toEqual(h);
    expect(decoded.body).toEqual(b);
  });

  test('starts with the KVLT magic bytes', () => {
    const bytes = encodeVaultFile(header(), body());
    expect(Buffer.from(bytes.subarray(0, 4)).toString('ascii')).toBe('KVLT');
  });

  test('rejects malformed input as CORRUPTED', () => {
    const good = encodeVaultFile(header(), body());
    const cases: Uint8Array[] = [
      new Uint8Array(0),
      new Uint8Array(5),
      good.slice(0, 20),
      good.slice(0, good.length - 40),
      Uint8Array.from(good, (v, i) => (i === 3 ? 0 : v)), // bad magic
      Uint8Array.from(good, (v, i) => (i === 4 ? 0xff : v)), // absurd header length
    ];
    for (const bytes of cases) {
      expect(() => decodeVaultFile(bytes)).toThrow(VaultError);
      expect(isWellFormedVaultFile(bytes)).toBe(false);
    }
  });

  test('rejects an unknown format version as UNSUPPORTED_VERSION', () => {
    const bytes = encodeVaultFile({ ...header(), formatVersion: 2 }, body());
    expect(() => decodeVaultFile(bytes)).toThrow(/different version/);
  });

  test('rejects a wrapped key or salt of the wrong size', () => {
    expect(() =>
      decodeVaultFile(
        encodeVaultFile({ ...header(), wrappedKey: generateRandomBytes(59) }, body()),
      ),
    ).toThrow(VaultError);
    expect(() =>
      decodeVaultFile(encodeVaultFile({ ...header(), salt: generateRandomBytes(8) }, body())),
    ).toThrow(VaultError);
  });
});
