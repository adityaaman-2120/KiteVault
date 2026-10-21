import { GeneratorError } from './passwordGenerator';
import { createUniformPicker, pickFrom, type UniformPicker } from './uniform';
import { WORDLIST } from './wordlist';

export const MIN_WORDS = 3;
export const MAX_WORDS = 10;

export const SEPARATORS = [
  { value: '-', label: '-' },
  { value: ' ', label: 'space' },
  { value: '.', label: '.' },
  { value: '_', label: '_' },
] as const;

export type PassphraseOptions = {
  words: number;
  separator: string;
  capitalize: boolean;
  // Adds one random digit to the end of one randomly chosen word.
  includeNumber: boolean;
};

export const DEFAULT_PASSPHRASE_OPTIONS: PassphraseOptions = {
  words: 6,
  separator: '-',
  capitalize: false,
  includeNumber: false,
};

export function generatePassphrase(options: PassphraseOptions, picker?: UniformPicker): string {
  if (!Number.isInteger(options.words) || options.words < MIN_WORDS || options.words > MAX_WORDS) {
    throw new GeneratorError(`Use ${MIN_WORDS} to ${MAX_WORDS} words.`);
  }
  if (!SEPARATORS.some((s) => s.value === options.separator)) {
    throw new GeneratorError('Unsupported separator.');
  }
  const own = picker ?? createUniformPicker();
  try {
    const words = Array.from({ length: options.words }, () => pickFrom(WORDLIST, own));
    if (options.capitalize) {
      words.forEach((word, i) => (words[i] = word.charAt(0).toUpperCase() + word.slice(1)));
    }
    if (options.includeNumber) {
      const at = own.pick(words.length);
      words[at] = `${words[at]}${own.pick(10)}`;
    }
    return words.join(options.separator);
  } finally {
    if (!picker) own.dispose();
  }
}

// Randomness in bits: each word is a uniform pick from the list. Capital letters and the
// separator are fixed, so they add nothing; the optional digit adds its value and its position.
export function passphraseEntropyBits(options: PassphraseOptions): number {
  const wordBits = options.words * Math.log2(WORDLIST.length);
  return options.includeNumber ? wordBits + Math.log2(10 * options.words) : wordBits;
}
