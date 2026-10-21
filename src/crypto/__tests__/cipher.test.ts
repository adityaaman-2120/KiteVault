import * as nodeCrypto from 'node:crypto';

import { CryptoError, decrypt, encrypt, IV_LENGTH, TAG_LENGTH } from '..';

const hex = (s: string) => new Uint8Array(Buffer.from(s, 'hex'));
const key = () => new Uint8Array(32).fill(7);
const text = (s: string) => new Uint8Array(Buffer.from(s, 'utf8'));

describe('encrypt / decrypt', () => {
  test.each([0, 1, 15, 16, 17, 1000, 100_000])('round trip with %i bytes', (size) => {
    const plaintext = new Uint8Array(size).map((_, i) => i % 251);
    const blob = encrypt(key(), plaintext);
    expect(blob.length).toBe(IV_LENGTH + size + TAG_LENGTH);
    expect(decrypt(key(), blob)).toEqual(plaintext);
  });

  test('round trip with unicode text', () => {
    const plaintext = text('pässwörd 🔐 日本語');
    expect(decrypt(key(), encrypt(key(), plaintext))).toEqual(plaintext);
  });

  test('wrong key fails with DECRYPT_FAILED', () => {
    const blob = encrypt(key(), text('secret'));
    const wrong = key();
    wrong[0] = 8;
    expect(() => decrypt(wrong, blob)).toThrow(CryptoError);
    expect(() => decrypt(wrong, blob)).toThrow(/wrong key or corrupted data/);
    try {
      decrypt(wrong, blob);
    } catch (e) {
      expect((e as CryptoError).code).toBe('DECRYPT_FAILED');
    }
  });

  test('flipping any single bit in iv, ciphertext, or tag fails', () => {
    const blob = encrypt(key(), text('a vault with several bytes of data'));
    for (let i = 0; i < blob.length; i++) {
      const tampered = blob.slice();
      tampered[i] = (tampered[i] ?? 0) ^ 0x01;
      expect(() => decrypt(key(), tampered)).toThrow(CryptoError);
    }
  });

  test('truncated, extended, and too-short blobs fail', () => {
    const blob = encrypt(key(), text('hello world'));
    expect(() => decrypt(key(), blob.slice(0, blob.length - 1))).toThrow(CryptoError);
    expect(() => decrypt(key(), new Uint8Array([...blob, 0]))).toThrow(CryptoError);
    expect(() => decrypt(key(), new Uint8Array(IV_LENGTH + TAG_LENGTH - 1))).toThrow(CryptoError);
    expect(() => decrypt(key(), new Uint8Array(0))).toThrow(CryptoError);
  });

  test('rejects keys that are not 32 bytes', () => {
    expect(() => encrypt(new Uint8Array(16), text('x'))).toThrow(/32 bytes/);
    expect(() => decrypt(new Uint8Array(31), new Uint8Array(40))).toThrow(/32 bytes/);
  });

  test('a fresh IV is used on every call and never repeats', () => {
    const seen = new Set<string>();
    const plaintext = text('same plaintext every time');
    const first = encrypt(key(), plaintext);
    for (let i = 0; i < 5000; i++) {
      const blob = i === 0 ? first : encrypt(key(), plaintext);
      seen.add(Buffer.from(blob.subarray(0, IV_LENGTH)).toString('hex'));
    }
    expect(seen.size).toBe(5000);
    // Same key and plaintext still gives different ciphertext.
    expect(encrypt(key(), plaintext)).not.toEqual(first);
  });

  test('output is standard AES-256-GCM (readable by Node crypto)', () => {
    const plaintext = text('interop check');
    const blob = encrypt(key(), plaintext);
    const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', key(), blob.subarray(0, 12));
    decipher.setAuthTag(blob.subarray(blob.length - 16));
    const out = Buffer.concat([
      decipher.update(blob.subarray(12, blob.length - 16)),
      decipher.final(),
    ]);
    expect(new Uint8Array(out)).toEqual(plaintext);
  });
});

// Vectors from "The Galois/Counter Mode of Operation (GCM)" by McGrew and Viega,
// test cases 13-15 (256-bit key, 96-bit IV, no additional data).
describe('AES-256-GCM known-answer tests', () => {
  const vectors = [
    {
      name: 'test case 13 (empty plaintext)',
      key: '0000000000000000000000000000000000000000000000000000000000000000',
      iv: '000000000000000000000000',
      plaintext: '',
      ciphertext: '',
      tag: '530f8afbc74536b9a963b4f1c4cb738b',
    },
    {
      name: 'test case 14',
      key: '0000000000000000000000000000000000000000000000000000000000000000',
      iv: '000000000000000000000000',
      plaintext: '00000000000000000000000000000000',
      ciphertext: 'cea7403d4d606b6e074ec5d3baf39d18',
      tag: 'd0d1c8a799996bf0265b98b5d48ab919',
    },
    {
      name: 'test case 15',
      key: 'feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308',
      iv: 'cafebabefacedbaddecaf888',
      plaintext:
        'd9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a72' +
        '1c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b391aafd255',
      ciphertext:
        '522dc1f099567d07f47f37a32a84427d643a8cdcbfe5c0c97598a2bd2555d1aa' +
        '8cb08e48590dbb3da7b08b1056828838c5f61e6393ba7a0abcc9f662898015ad',
      tag: 'b094dac5d93471bdec1a502270e3cc6c',
    },
  ];

  test.each(vectors)('decrypts $name', (v) => {
    const blob = hex(v.iv + v.ciphertext + v.tag);
    expect(decrypt(hex(v.key), blob)).toEqual(hex(v.plaintext));
  });

  test.each(vectors)('rejects $name with a modified tag', (v) => {
    const blob = hex(v.iv + v.ciphertext + v.tag);
    blob[blob.length - 1] = (blob[blob.length - 1] ?? 0) ^ 0xff;
    expect(() => decrypt(hex(v.key), blob)).toThrow(CryptoError);
  });
});
