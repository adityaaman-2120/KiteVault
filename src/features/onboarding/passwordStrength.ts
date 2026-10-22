import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as common from '@zxcvbn-ts/language-common';
import * as english from '@zxcvbn-ts/language-en';

import type { StrengthLevel } from '@/components';

// Runs entirely on the device; nothing is sent anywhere.
// Built on first use, not when the app starts: building the word lists takes time that the
// unlock screen does not need.
let zxcvbn: ZxcvbnFactory | undefined;
function getZxcvbn(): ZxcvbnFactory {
  zxcvbn ??= new ZxcvbnFactory({
    translations: english.translations,
    graphs: common.adjacencyGraphs,
    dictionary: { ...common.dictionary, ...english.dictionary },
  });
  return zxcvbn;
}

// Very long inputs are cut off for scoring only, to keep typing responsive.
const MAX_SCORED_LENGTH = 128;

const LABELS = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'] as const;

export type PasswordStrength = {
  score: StrengthLevel;
  label: (typeof LABELS)[number];
  hint?: string;
};

// `userInputs` are words that make the password easier to guess (a site name, a user name).
export function evaluatePassword(password: string, userInputs: string[] = []): PasswordStrength {
  if (password.length === 0) return { score: 0, label: LABELS[0] };
  const result = getZxcvbn().check(password.slice(0, MAX_SCORED_LENGTH), userInputs);
  const score = result.score as StrengthLevel;
  const hint = result.feedback.warning || result.feedback.suggestions[0] || undefined;
  return { score, label: LABELS[score], hint };
}
