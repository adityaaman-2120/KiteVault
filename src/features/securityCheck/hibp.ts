import { sha1, utf8Encode } from '@/crypto';

// Have I Been Pwned "Pwned Passwords" range API, used with k-anonymity:
//   1. the password is hashed with SHA-1 on this phone;
//   2. only the first 5 characters of the hash are sent;
//   3. the server returns every known hash that starts with them (hundreds), without saying
//      which one we meant, and the rest of the hash is compared here.
// So neither the password, nor its full hash, nor which entry it belongs to ever leaves the phone.

export const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const PREFIX_LENGTH = 5;
const REQUEST_TIMEOUT_MS = 15_000;

export type BreachErrorKind = 'offline' | 'rate-limited' | 'server' | 'cancelled';

// Carries only a kind; never a password, a hash or a reply.
export class BreachCheckError extends Error {
  readonly kind: BreachErrorKind;
  constructor(kind: BreachErrorKind) {
    super(`Breach check error: ${kind}`);
    this.name = 'BreachCheckError';
    this.kind = kind;
  }
}

export const BREACH_ERROR_TEXT: Record<BreachErrorKind, string> = {
  offline: 'No internet connection, or the service did not answer. Nothing was checked.',
  'rate-limited': 'The service asked us to slow down. Try again in a few minutes.',
  server: 'The breach service had a problem. Try again later.',
  cancelled: 'Stopped.',
};

export function sha1Upper(password: string): string {
  return Array.from(sha1(utf8Encode(password)), (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

// Reads "SUFFIX:COUNT" lines. The service adds fake rows with a count of 0 (see Add-Padding
// below); those are dropped, as is anything that is not a 35 character hash suffix.
export function parseRange(text: string): Map<string, number> {
  const found = new Map<string, number>();
  for (const line of text.split(/\r?\n/)) {
    const [suffix, count] = line.trim().split(':');
    const n = Number(count);
    if (suffix && /^[0-9A-F]{35}$/i.test(suffix) && Number.isFinite(n) && n > 0) {
      found.set(suffix.toUpperCase(), n);
    }
  }
  return found;
}

type FetchLike = typeof fetch;

export async function fetchRange(
  prefix: string,
  fetchImpl: FetchLike,
  signal?: AbortSignal,
): Promise<Map<string, number>> {
  if (!/^[0-9A-F]{5}$/.test(prefix)) throw new RangeError('A range prefix is 5 hex characters.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    // Add-Padding makes every reply about the same size, so its length says nothing about the hash.
    const response = await fetchImpl(`${HIBP_RANGE_URL}${prefix}`, {
      method: 'GET',
      headers: { 'Add-Padding': 'true' },
      signal: controller.signal,
    });
    if (response.status === 429) throw new BreachCheckError('rate-limited');
    if (!response.ok) throw new BreachCheckError('server');
    return parseRange(await response.text());
  } catch (error) {
    if (error instanceof BreachCheckError) throw error;
    // fetch only throws when no reply came at all: no connection, the timeout, or our own stop.
    throw new BreachCheckError(signal?.aborted ? 'cancelled' : 'offline');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export type BreachCheckOptions = {
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  concurrency?: number;
};

// Looks up every distinct password. Returns the SHA-1 (upper case hex) of each one that appears
// in a known breach, with how many times. Passwords that were not found are simply absent.
// Throws BreachCheckError if any request fails: a partial answer would look like "all clear".
export async function findBreached(
  passwords: Iterable<string>,
  options: BreachCheckOptions = {},
): Promise<Map<string, number>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const hashes = new Set<string>();
  for (const password of passwords) if (password !== '') hashes.add(sha1Upper(password));

  // One request per distinct prefix, however many passwords share it.
  const byPrefix = new Map<string, string[]>();
  for (const hash of hashes) {
    const prefix = hash.slice(0, PREFIX_LENGTH);
    byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), hash.slice(PREFIX_LENGTH)]);
  }

  const prefixes = [...byPrefix.keys()];
  const breached = new Map<string, number>();
  let next = 0;
  let done = 0;
  options.onProgress?.(0, prefixes.length);

  async function worker() {
    while (next < prefixes.length) {
      if (options.signal?.aborted) throw new BreachCheckError('cancelled');
      const prefix = prefixes[next++]!;
      const range = await fetchRange(prefix, fetchImpl, options.signal);
      for (const suffix of byPrefix.get(prefix)!) {
        const count = range.get(suffix);
        if (count) breached.set(prefix + suffix, count);
      }
      options.onProgress?.(++done, prefixes.length);
    }
  }

  const workers = Math.max(1, Math.min(options.concurrency ?? 4, prefixes.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return breached;
}
