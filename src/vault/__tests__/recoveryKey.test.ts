import { createHash } from 'node:crypto';

import {
  decodeBase32,
  encodeBase32,
  formatRecoveryKey,
  generateRecoveryKey,
  normalizeRecoveryText,
  parseRecoveryKey,
  RECOVERY_KEY_BYTES,
  RecoveryKeyFormatError,
} from '../recoveryKey';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

describe('base32', () => {
  test.each([
    [[0, 0, 0, 0, 0], '00000000'],
    [[255, 255, 255, 255, 255], 'ZZZZZZZZ'],
    [[1, 2, 3, 4, 5], '04106105'],
    [[0x80, 0, 0, 0, 0], 'G0000000'],
  ])('encodes %j as %s', (bytes, text) => {
    expect(encodeBase32(Uint8Array.from(bytes))).toBe(text);
    expect([...decodeBase32(text)!]).toEqual(bytes);
  });

  test('round trips random data of several lengths', () => {
    for (const length of [5, 10, 35]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 73 + 41) & 255);
      expect(decodeBase32(encodeBase32(bytes))).toEqual(bytes);
    }
  });

  test('rejects characters outside the alphabet', () => {
    for (const bad of ['I', 'L', 'O', 'U', 'a', '-', ' ', '!']) {
      expect(decodeBase32('0000000' + bad)).toBeNull();
    }
  });
});

// A fixed key keeps the typo tests repeatable (a 24-bit checksum could miss a typo by pure chance).
const FIXED_KEY = Uint8Array.from({ length: 32 }, (_, i) => i * 7 + 3);

describe('recovery key text', () => {
  test('is 8 groups of 7 characters from the safe alphabet', () => {
    const text = formatRecoveryKey(generateRecoveryKey());
    expect(text).toMatch(/^[0-9A-HJKMNP-TV-Z]{7}(-[0-9A-HJKMNP-TV-Z]{7}){7}$/);
    expect(text.split('-')).toHaveLength(8);
    for (const char of text.replace(/-/g, '')) expect(ALPHABET).toContain(char);
    expect(text).not.toMatch(/[ILOU]/); // never confusable
  });

  test('is 256 bits of key plus a 24-bit checksum (280 bits = 56 characters)', () => {
    const key = Uint8Array.from({ length: 32 }, (_, i) => i);
    const bytes = decodeBase32(formatRecoveryKey(key).replace(/-/g, ''))!;
    expect(bytes).toHaveLength(35);
    expect([...bytes.slice(0, 32)]).toEqual([...key]);
    // The checksum is independently the first 3 bytes of SHA-256("KiteVault recovery key v1" + key).
    const expected = createHash('sha256')
      .update(Buffer.concat([Buffer.from('KiteVault recovery key v1'), Buffer.from(key)]))
      .digest()
      .subarray(0, 3);
    expect([...bytes.slice(32)]).toEqual([...expected]);
  });

  test('every key is different, and 256 bits long', () => {
    const keys = new Set(
      Array.from({ length: 200 }, () => formatRecoveryKey(generateRecoveryKey())),
    );
    expect(keys.size).toBe(200);
    expect(generateRecoveryKey()).toHaveLength(RECOVERY_KEY_BYTES);
  });

  test('parses back to exactly the same key', () => {
    for (let i = 0; i < 50; i++) {
      const key = generateRecoveryKey();
      expect(parseRecoveryKey(formatRecoveryKey(key))).toEqual(key);
    }
  });

  test('is forgiving about how it is typed', () => {
    const key = generateRecoveryKey();
    const text = formatRecoveryKey(key);
    const variants = [
      text.toLowerCase(),
      text.replace(/-/g, ' '),
      text.replace(/-/g, ''),
      `  ${text.split('-').join('  -  ')}\n`,
      text.replace(/0/g, 'O'), // a letter O typed for a zero
      text.replace(/1/g, 'l').replace(/0/g, 'o'),
      text.replace(/1/g, 'I'),
    ];
    for (const variant of variants) expect(parseRecoveryKey(variant)).toEqual(key);
    expect(normalizeRecoveryText(' ab-O I l ')).toBe('AB011');
  });

  test('rejects a wrong length', () => {
    const text = formatRecoveryKey(generateRecoveryKey());
    for (const bad of ['', text.slice(0, -1), text + '0', text.slice(0, 20)]) {
      expect(() => parseRecoveryKey(bad)).toThrow(RecoveryKeyFormatError);
      expect(() => parseRecoveryKey(bad)).toThrow(/LENGTH/);
    }
  });

  test('rejects a character that cannot be in a key', () => {
    const text = formatRecoveryKey(generateRecoveryKey());
    for (const bad of ['U', '#', 'é', '!']) {
      const broken = bad + text.slice(1);
      expect(() => parseRecoveryKey(broken.replace(/-/g, ''))).toThrow(/CHARACTER/);
    }
  });

  test('catches every possible single-character typo', () => {
    // 56 positions x 31 other characters = 1,736 mistakes; none may be accepted.
    const text = formatRecoveryKey(FIXED_KEY).replace(/-/g, '');
    let accepted = 0;
    for (let i = 0; i < text.length; i++) {
      for (const char of ALPHABET) {
        if (char === text[i]) continue;
        const typo = text.slice(0, i) + char + text.slice(i + 1);
        try {
          parseRecoveryKey(typo);
          accepted++;
        } catch (error) {
          expect(error).toBeInstanceOf(RecoveryKeyFormatError);
        }
      }
    }
    expect(accepted).toBe(0);
  });

  test('catches swapped groups and swapped neighbouring characters', () => {
    const groups = formatRecoveryKey(FIXED_KEY).split('-');
    const swapped = [...groups];
    [swapped[2], swapped[5]] = [swapped[5]!, swapped[2]!];
    expect(() => parseRecoveryKey(swapped.join('-'))).toThrow(/CHECKSUM/);

    const text = groups.join('');
    let tried = 0;
    for (let i = 0; i < text.length - 1; i++) {
      if (text[i] === text[i + 1]) continue;
      const transposed = text.slice(0, i) + text[i + 1] + text[i] + text.slice(i + 2);
      expect(() => parseRecoveryKey(transposed)).toThrow(RecoveryKeyFormatError);
      tried++;
    }
    expect(tried).toBeGreaterThan(40);
  });

  test('refuses to format a key of the wrong size', () => {
    expect(() => formatRecoveryKey(new Uint8Array(31))).toThrow(RangeError);
  });
});
