import type { StrengthLevel } from '@/components';

export type GeneratedStrength = { score: StrengthLevel; label: string; hint: string };

// For a password we generated ourselves we know how random it is, so the rating comes from that
// (the zxcvbn guesser used for typed passwords would under-rate random words).
// Rough guide: under 40 bits falls to a determined attacker quickly; 80 bits or more is out of
// reach of any realistic offline attack.
export function strengthFromBits(bits: number): GeneratedStrength {
  const hint = `About ${Math.floor(bits)} bits of randomness`;
  if (bits < 28) return { score: 0, label: 'Very weak', hint };
  if (bits < 40) return { score: 1, label: 'Weak', hint };
  if (bits < 60) return { score: 2, label: 'Fair', hint };
  if (bits < 80) return { score: 3, label: 'Good', hint };
  return { score: 4, label: 'Strong', hint };
}
