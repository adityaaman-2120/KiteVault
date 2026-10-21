import type { StrengthLevel } from '@/components';
import { isTrashed } from '@/features/entries/model';
import type { Entry } from '@/vault';

import { likelySupports2fa } from './sites2fa';

export type IssueKind = 'breached' | 'weak' | 'reused' | 'missing-password' | 'old' | 'no-2fa';

export type Issue = {
  kind: IssueKind;
  entryId: string;
  title: string;
  username: string;
  detail: string;
};

// Order in the list, and how much each problem lowers the score. An entry is charged for its
// worst problem only, so one bad password is not counted three times. "no-2fa" is a suggestion
// and does not change the score.
export const ISSUE_ORDER: IssueKind[] = [
  'breached',
  'weak',
  'reused',
  'missing-password',
  'old',
  'no-2fa',
];
export const ISSUE_WEIGHT: Record<IssueKind, number> = {
  breached: 1,
  weak: 0.8,
  reused: 0.6,
  'missing-password': 0.5,
  old: 0.3,
  'no-2fa': 0,
};
export const ISSUE_TITLE: Record<IssueKind, string> = {
  breached: 'Found in a data breach',
  weak: 'Weak passwords',
  reused: 'Reused passwords',
  'missing-password': 'No password saved',
  old: 'Old passwords',
  'no-2fa': 'Could use 2FA',
};

export const OLD_PASSWORD_MS = 365 * 24 * 60 * 60 * 1000;
// Scores 0 and 1 of zxcvbn are "very guessable" and "guessable".
export const WEAK_SCORE_MAX = 1;

export type CheckResult = {
  score: number | null; // 0-100, null when there is no login to check
  label: string;
  logins: number; // logins checked
  issues: Issue[];
  counts: Record<IssueKind, number>;
};

export type AnalyzeOptions = {
  now: number;
  // The zxcvbn rating of a password; `inputs` are words from the entry that make it easier to guess.
  rate: (password: string, inputs: string[]) => StrengthLevel;
  // SHA-1 (upper case hex) of a password; used only to look up breach results.
  hash: (password: string) => string;
  // Hashes found in a breach and how often; undefined if the breach check was not run.
  breached?: ReadonlyMap<string, number>;
  include2fa?: boolean;
  // Lets the screen stay responsive on big vaults: called every few entries.
  pause?: () => Promise<void>;
  onProgress?: (done: number, total: number) => void;
};

const CHUNK = 25;
const defaultPause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// Age of the CURRENT password: since it was set, or since the entry was made.
export function passwordSetAt(entry: Entry): number {
  return entry.passwordHistory[0]?.changedAt ?? entry.createdAt;
}

export function scoreLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 50) return 'Fair';
  return 'Poor';
}

const years = (ms: number) => Math.floor(ms / OLD_PASSWORD_MS);

// Runs every local check. Nothing here touches the network, and no password is kept in the result:
// only entry ids, titles and short descriptions.
export async function analyzeEntries(
  entries: readonly Entry[],
  options: AnalyzeOptions,
): Promise<CheckResult> {
  const pause = options.pause ?? defaultPause;
  const logins = entries.filter((e) => e.type === 'login' && !isTrashed(e));

  // Reuse: how many logins share each password.
  const uses = new Map<string, number>();
  for (const e of logins) if (e.password) uses.set(e.password, (uses.get(e.password) ?? 0) + 1);

  const ratings = new Map<string, StrengthLevel>(); // same password, rated once
  const hashes = new Map<string, string>();
  const issues: Issue[] = [];
  const worst = new Map<string, number>(); // entry id -> its highest weight

  const add = (entry: Entry, kind: IssueKind, detail: string) => {
    issues.push({ kind, entryId: entry.id, title: entry.title, username: entry.username, detail });
    worst.set(entry.id, Math.max(worst.get(entry.id) ?? 0, ISSUE_WEIGHT[kind]));
  };

  let done = 0;
  for (const entry of logins) {
    const password = entry.password;
    if (!password) {
      add(entry, 'missing-password', 'This login has no password saved.');
    } else {
      if (options.breached) {
        let hash = hashes.get(password);
        if (hash === undefined) hashes.set(password, (hash = options.hash(password)));
        const count = options.breached.get(hash);
        if (count) {
          add(
            entry,
            'breached',
            `This password appeared in known data breaches (${count.toLocaleString('en-US')} times). Change it everywhere you use it.`,
          );
        }
      }
      let rating = ratings.get(password);
      if (rating === undefined) {
        const inputs = [entry.title, entry.username].filter(Boolean);
        ratings.set(password, (rating = options.rate(password, inputs)));
      }
      if (rating <= WEAK_SCORE_MAX) add(entry, 'weak', 'This password is easy to guess.');

      const count = uses.get(password) ?? 0;
      if (count > 1)
        add(
          entry,
          'reused',
          `The same password is used by ${count - 1} other ${count === 2 ? 'login' : 'logins'}.`,
        );

      const age = options.now - passwordSetAt(entry);
      if (age > OLD_PASSWORD_MS) {
        const y = years(age);
        add(
          entry,
          'old',
          `This password has not changed for more than ${y} ${y === 1 ? 'year' : 'years'}.`,
        );
      }
    }
    if (options.include2fa !== false && !entry.totpSecret && likelySupports2fa(entry.urls)) {
      add(entry, 'no-2fa', 'This site supports two-factor codes. Add 2FA to this entry.');
    }

    done++;
    if (done % CHUNK === 0) {
      options.onProgress?.(done, logins.length);
      await pause();
    }
  }
  options.onProgress?.(logins.length, logins.length);

  const rank = (kind: IssueKind) => ISSUE_ORDER.indexOf(kind);
  issues.sort((a, b) => rank(a.kind) - rank(b.kind) || a.title.localeCompare(b.title));

  const counts = Object.fromEntries(ISSUE_ORDER.map((k) => [k, 0])) as Record<IssueKind, number>;
  for (const issue of issues) counts[issue.kind]++;

  let penalty = 0;
  for (const weight of worst.values()) penalty += weight;
  const score = logins.length === 0 ? null : Math.round(100 * (1 - penalty / logins.length));
  return {
    score,
    label: score === null ? 'Nothing to check' : scoreLabel(score),
    logins: logins.length,
    issues,
    counts,
  };
}
