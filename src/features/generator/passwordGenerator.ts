import { createUniformPicker, pickFrom, shuffle, type UniformPicker } from './uniform';

export const MIN_LENGTH = 8;
export const MAX_LENGTH = 64;

export const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
export const NUMBERS = '0123456789';
// No quotes, backslash, space or backtick: they are rejected or mangled by many sites and forms.
export const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.<>?/~';
// Characters that are easy to mix up when reading or typing a password.
export const LOOK_ALIKES = 'Il1|O0o';

export type PasswordOptions = {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
  excludeLookAlikes: boolean;
};

export const DEFAULT_PASSWORD_OPTIONS: PasswordOptions = {
  length: 20,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
  excludeLookAlikes: false,
};

export class GeneratorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeneratorError';
  }
}

// The groups of characters switched on by the options, look-alikes already removed.
export function buildCharsets(options: PasswordOptions): string[] {
  const groups = [
    options.uppercase ? UPPERCASE : '',
    options.lowercase ? LOWERCASE : '',
    options.numbers ? NUMBERS : '',
    options.symbols ? SYMBOLS : '',
  ];
  return groups
    .map((group) =>
      options.excludeLookAlikes
        ? [...group].filter((c) => !LOOK_ALIKES.includes(c)).join('')
        : group,
    )
    .filter((group) => group.length > 0);
}

function validate(options: PasswordOptions): string[] {
  if (
    !Number.isInteger(options.length) ||
    options.length < MIN_LENGTH ||
    options.length > MAX_LENGTH
  ) {
    throw new GeneratorError(`Length must be a whole number from ${MIN_LENGTH} to ${MAX_LENGTH}.`);
  }
  const sets = buildCharsets(options);
  if (sets.length === 0) throw new GeneratorError('Choose at least one kind of character.');
  return sets;
}

// Builds a password from secure random numbers only. Every selected kind of character appears at
// least once (many sites insist on that), and the positions are shuffled with an unbiased shuffle.
export function generatePassword(options: PasswordOptions, picker?: UniformPicker): string {
  const sets = validate(options);
  const own = picker ?? createUniformPicker();
  try {
    const all = sets.join('');
    const chars: string[] = sets.map((set) => pickFrom([...set], own));
    const allChars = [...all];
    while (chars.length < options.length) chars.push(pickFrom(allChars, own));
    return shuffle(chars, own).join('');
  } finally {
    if (!picker) own.dispose();
  }
}

// How many different strings of `length` characters exist when every group in `sizes` must
// appear at least once (inclusion-exclusion over the groups that are missing).
export function countPasswords(sizes: number[], length: number): number {
  const total = sizes.reduce((a, b) => a + b, 0);
  let count = 0;
  for (let mask = 0; mask < 1 << sizes.length; mask++) {
    let missing = 0;
    let bits = 0;
    sizes.forEach((size, i) => {
      if (mask & (1 << i)) {
        missing += size;
        bits++;
      }
    });
    count += (bits % 2 === 0 ? 1 : -1) * (total - missing) ** length;
  }
  return count;
}

// An upper bound for the randomness in bits: about the log2 of the number of possible results.
export function passwordEntropyBits(options: PasswordOptions): number {
  const sets = buildCharsets(options);
  if (sets.length === 0) return 0;
  return Math.log2(
    countPasswords(
      sets.map((s) => s.length),
      options.length,
    ),
  );
}
