import { generateRandomBytes } from '@/crypto';

import {
  generatePassphrase,
  MAX_WORDS,
  MIN_WORDS,
  passphraseEntropyBits,
  SEPARATORS,
  DEFAULT_PASSPHRASE_OPTIONS,
} from '../passphrase';
import {
  buildCharsets,
  countPasswords,
  DEFAULT_PASSWORD_OPTIONS,
  generatePassword,
  GeneratorError,
  LOOK_ALIKES,
  LOWERCASE,
  MAX_LENGTH,
  MIN_LENGTH,
  NUMBERS,
  passwordEntropyBits,
  SYMBOLS,
  UPPERCASE,
  type PasswordOptions,
} from '../passwordGenerator';
import { strengthFromBits } from '../strength';
import { createUniformPicker } from '../uniform';
import { WORDLIST } from '../wordlist';

// Wraps the real generator so the test can see that it is the one being used.
jest.mock('@/crypto', () => {
  const actual = jest.requireActual('@/crypto');
  return { ...actual, generateRandomBytes: jest.fn(actual.generateRandomBytes) };
});

const opts = (over: Partial<PasswordOptions> = {}): PasswordOptions => ({
  ...DEFAULT_PASSWORD_OPTIONS,
  ...over,
});
const ALL_SETS = { uppercase: true, lowercase: true, numbers: true, symbols: true };

describe('password length', () => {
  test.each(Array.from({ length: MAX_LENGTH - MIN_LENGTH + 1 }, (_, i) => MIN_LENGTH + i))(
    'is exactly %i characters',
    (length) => {
      for (let i = 0; i < 5; i++)
        expect([...generatePassword(opts({ length }))]).toHaveLength(length);
    },
  );

  test.each([7, 65, 0, -8, 20.5, NaN, Infinity])('rejects length %p', (length) => {
    expect(() => generatePassword(opts({ length }))).toThrow(GeneratorError);
  });
});

describe('character sets', () => {
  const sets: Record<string, string> = {
    uppercase: UPPERCASE,
    lowercase: LOWERCASE,
    numbers: NUMBERS,
    symbols: SYMBOLS,
  };
  const keys = ['uppercase', 'lowercase', 'numbers', 'symbols'] as const;

  // Every non-empty combination of the four switches.
  const combos = Array.from({ length: 15 }, (_, i) => i + 1).map((mask) =>
    keys.filter((_, bit) => mask & (1 << bit)),
  );

  test.each(combos.map((c) => [c.join('+'), c] as const))(
    'only uses the characters of %s, and at least one of each',
    (_name, enabled) => {
      const options = opts({
        uppercase: enabled.includes('uppercase'),
        lowercase: enabled.includes('lowercase'),
        numbers: enabled.includes('numbers'),
        symbols: enabled.includes('symbols'),
        length: enabled.length === 4 ? 8 : 12, // short passwords are the hardest case for "at least one"
      });
      const allowed = enabled.map((k) => sets[k]).join('');
      for (let i = 0; i < 300; i++) {
        const password = generatePassword(options);
        for (const char of password) expect(allowed).toContain(char);
        for (const kind of enabled) {
          expect([...password].some((c) => sets[kind]!.includes(c))).toBe(true);
        }
      }
    },
  );

  test('refuses when no kind of character is selected', () => {
    expect(() =>
      generatePassword(
        opts({ uppercase: false, lowercase: false, numbers: false, symbols: false }),
      ),
    ).toThrow(/at least one kind/i);
  });

  test('look-alike characters never appear when excluded', () => {
    for (let i = 0; i < 400; i++) {
      const password = generatePassword(
        opts({ ...ALL_SETS, excludeLookAlikes: true, length: MAX_LENGTH }),
      );
      for (const char of LOOK_ALIKES) expect(password).not.toContain(char);
    }
    expect(buildCharsets(opts({ excludeLookAlikes: true })).join('')).not.toMatch(/[Il1|O0o]/);
  });

  test('look-alikes do appear (over many tries) when not excluded', () => {
    let seen = '';
    for (let i = 0; i < 200; i++) seen += generatePassword(opts({ length: MAX_LENGTH }));
    for (const char of 'IlO0o1') expect(seen).toContain(char);
  });

  test('excluding look-alikes does not empty a set (numbers still work)', () => {
    const only = opts({
      uppercase: false,
      lowercase: false,
      symbols: false,
      excludeLookAlikes: true,
    });
    expect(buildCharsets(only)).toEqual(['23456789']);
    expect(generatePassword({ ...only, length: 30 })).toMatch(/^[2-9]{30}$/);
  });

  test('no quotes, backslashes or spaces are ever produced', () => {
    for (let i = 0; i < 300; i++) {
      expect(generatePassword(opts({ length: MAX_LENGTH }))).not.toMatch(/["'\\`\s]/);
    }
  });
});

describe('randomness', () => {
  test('every call gives a different password', () => {
    const seen = new Set(Array.from({ length: 500 }, () => generatePassword(opts())));
    expect(seen.size).toBe(500);
  });

  test('draws only from the secure generator and never uses Math.random', () => {
    const random = jest.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random must not be used');
    });
    const bytes = generateRandomBytes as jest.Mock;
    bytes.mockClear();
    try {
      generatePassword(opts({ length: 40 }));
      generatePassphrase(DEFAULT_PASSPHRASE_OPTIONS);
      expect(bytes).toHaveBeenCalled();
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });

  test('is fully determined by the random source (no hidden randomness)', () => {
    const makeSource = () => {
      let counter = 0;
      return () => Uint8Array.from({ length: 256 }, () => (counter++ * 37 + 11) & 255);
    };
    const a = generatePassword(opts(), createUniformPicker(makeSource()));
    const b = generatePassword(opts(), createUniformPicker(makeSource()));
    expect(a).toBe(b);
  });

  test('characters of a lowercase-only password are uniformly spread', () => {
    const counts = new Map<string, number>();
    const options = opts({ uppercase: false, numbers: false, symbols: false, length: MAX_LENGTH });
    for (let i = 0; i < 400; i++) {
      for (const c of generatePassword(options)) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    expect(counts.size).toBe(26);
    const total = 400 * MAX_LENGTH;
    const expected = total / 26;
    const chi = [...counts.values()].reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
    expect(chi).toBeLessThan(70); // df = 25; 70 is far beyond a fair-chance fluctuation
  });
});

describe('entropy and strength', () => {
  test('counts strings that must contain every group', () => {
    expect(countPasswords([2, 3], 2)).toBe(12); // 2 * 3 * 2 orders
    expect(countPasswords([1], 3)).toBe(1);
    expect(countPasswords([2, 2], 3)).toBe(48); // 4^3 - 2^3 - 2^3
  });

  test('is close to length * log2(pool) and grows with length', () => {
    const o = opts({ length: 20 });
    const pool = buildCharsets(o).join('').length;
    expect(passwordEntropyBits(o)).toBeGreaterThan(20 * Math.log2(pool) - 2);
    expect(passwordEntropyBits(o)).toBeLessThanOrEqual(20 * Math.log2(pool));
    expect(passwordEntropyBits(opts({ length: 21 }))).toBeGreaterThan(passwordEntropyBits(o));
    expect(passwordEntropyBits(opts({ length: MAX_LENGTH }))).toBeLessThan(MAX_LENGTH * 7);
  });

  test('fewer kinds of character means less entropy', () => {
    expect(passwordEntropyBits(opts({ symbols: false }))).toBeLessThan(passwordEntropyBits(opts()));
    expect(passwordEntropyBits(opts({ excludeLookAlikes: true }))).toBeLessThan(
      passwordEntropyBits(opts()),
    );
  });

  test.each([
    [10, 0, 'Very weak'],
    [30, 1, 'Weak'],
    [45, 2, 'Fair'],
    [70, 3, 'Good'],
    [80, 4, 'Strong'],
    [200, 4, 'Strong'],
  ])('%i bits is level %i (%s)', (bits, score, label) => {
    expect(strengthFromBits(bits)).toMatchObject({ score, label });
  });

  test('default settings rate as strong', () => {
    expect(strengthFromBits(passwordEntropyBits(opts())).label).toBe('Strong');
    expect(
      strengthFromBits(passwordEntropyBits(opts({ length: 8, symbols: false, numbers: false })))
        .score,
    ).toBeLessThanOrEqual(2);
  });
});

describe('word list', () => {
  test('is the cleaned EFF large list', () => {
    expect(WORDLIST).toHaveLength(7772); // 7,776 minus 4 hyphenated words
    expect(new Set(WORDLIST).size).toBe(WORDLIST.length);
    for (const word of WORDLIST) expect(word).toMatch(/^[a-z]{3,9}$/);
    expect(WORDLIST).toContain('abacus');
    expect(WORDLIST).not.toContain('drop-down');
  });
});

describe('passphrase', () => {
  const words = (phrase: string, separator = '-') => phrase.split(separator);

  test.each(Array.from({ length: MAX_WORDS - MIN_WORDS + 1 }, (_, i) => MIN_WORDS + i))(
    'has exactly %i words from the list',
    (count) => {
      const phrase = generatePassphrase({ ...DEFAULT_PASSPHRASE_OPTIONS, words: count });
      expect(words(phrase)).toHaveLength(count);
      for (const word of words(phrase)) expect(WORDLIST).toContain(word);
    },
  );

  test.each(SEPARATORS.map((s) => s.value))('uses the separator %j', (separator) => {
    const phrase = generatePassphrase({ ...DEFAULT_PASSPHRASE_OPTIONS, separator });
    expect(words(phrase, separator)).toHaveLength(DEFAULT_PASSPHRASE_OPTIONS.words);
  });

  test('capitalizes every word on request', () => {
    const phrase = generatePassphrase({ ...DEFAULT_PASSPHRASE_OPTIONS, capitalize: true });
    for (const word of words(phrase)) expect(word).toMatch(/^[A-Z][a-z]+$/);
  });

  test('adds exactly one digit to one word on request', () => {
    for (let i = 0; i < 100; i++) {
      const phrase = generatePassphrase({ ...DEFAULT_PASSPHRASE_OPTIONS, includeNumber: true });
      expect(phrase.match(/\d/g)).toHaveLength(1);
      expect(phrase).toMatch(/[a-z]\d(-|$)/);
    }
    expect(generatePassphrase(DEFAULT_PASSPHRASE_OPTIONS)).not.toMatch(/\d/);
  });

  test('rejects bad options', () => {
    expect(() => generatePassphrase({ ...DEFAULT_PASSPHRASE_OPTIONS, words: 2 })).toThrow(
      GeneratorError,
    );
    expect(() => generatePassphrase({ ...DEFAULT_PASSPHRASE_OPTIONS, words: 11 })).toThrow(
      GeneratorError,
    );
    expect(() => generatePassphrase({ ...DEFAULT_PASSPHRASE_OPTIONS, separator: '' })).toThrow(
      GeneratorError,
    );
  });

  test('picks every word of the list with equal chance (spot check)', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 4000; i++) {
      for (const word of words(generatePassphrase({ ...DEFAULT_PASSPHRASE_OPTIONS, words: 10 }))) {
        counts.set(word, (counts.get(word) ?? 0) + 1);
      }
    }
    // 40,000 picks over 7,772 words: about 5.1 each. No word should be wildly over-represented.
    expect(Math.max(...counts.values())).toBeLessThan(20);
    expect(counts.size).toBeGreaterThan(5000);
  });

  test('entropy: about 12.9 bits per word, plus the digit if used', () => {
    expect(passphraseEntropyBits({ ...DEFAULT_PASSPHRASE_OPTIONS, words: 6 })).toBeCloseTo(
      6 * Math.log2(7772),
      5,
    );
    expect(
      passphraseEntropyBits({ ...DEFAULT_PASSPHRASE_OPTIONS, words: 6, includeNumber: true }),
    ).toBeCloseTo(6 * Math.log2(7772) + Math.log2(60), 5);
    expect(strengthFromBits(passphraseEntropyBits(DEFAULT_PASSPHRASE_OPTIONS)).label).toBe('Good'); // ~77 bits
    expect(
      strengthFromBits(passphraseEntropyBits({ ...DEFAULT_PASSPHRASE_OPTIONS, words: 7 })).label,
    ).toBe('Strong');
  });
});
