import {
  BreachCheckError,
  fetchRange,
  findBreached,
  HIBP_RANGE_URL,
  parseRange,
  sha1Upper,
} from '../hibp';

// SHA-1("password") is the best-known entry of the real list.
const PASSWORD_HASH = '5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8';
const PREFIX = PASSWORD_HASH.slice(0, 5);
const SUFFIX = PASSWORD_HASH.slice(5);
const PAD = 'A'.repeat(35);

type Call = { url: string; init: RequestInit };

// A pretend range API. `ranges` maps a prefix to the text the real service would return.
function fakeApi(ranges: Record<string, string>, behaviour?: (prefix: string) => Response | void) {
  const calls: Call[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const fetchImpl = jest.fn(async (input: unknown, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1));
      const prefix = url.slice(HIBP_RANGE_URL.length);
      const special = behaviour?.(prefix);
      if (special) return special;
      return new Response(ranges[prefix] ?? '', { status: 200 });
    } finally {
      inFlight--;
    }
  }) as unknown as typeof fetch;
  return { fetchImpl, calls, maxInFlight: () => maxInFlight };
}

describe('sha1Upper', () => {
  test('matches the SHA-1 test vectors', () => {
    expect(sha1Upper('password')).toBe(PASSWORD_HASH);
    expect(sha1Upper('abc')).toBe('A9993E364706816ABA3E25717850C26C9CD0D89D');
    expect(sha1Upper('')).toBe('DA39A3EE5E6B4B0D3255BFEF95601890AFD80709');
  });
  test('hashes the UTF-8 bytes of non-ASCII passwords', () => {
    expect(sha1Upper('pässwörd')).toMatch(/^[0-9A-F]{40}$/);
    expect(sha1Upper('pässwörd')).not.toBe(sha1Upper('passwrd'));
  });
});

describe('parseRange', () => {
  test('reads suffix:count lines and drops the padding rows (count 0)', () => {
    const map = parseRange(`${SUFFIX}:9545824\r\n${PAD}:0\r\n${'B'.repeat(35)}:2\n`);
    expect([...map]).toEqual([
      [SUFFIX, 9545824],
      ['B'.repeat(35), 2],
    ]);
  });
  test('ignores anything that is not a hash suffix', () => {
    expect(parseRange('hello\n:5\nZZZ:1\nA:1\n<html>error</html>').size).toBe(0);
    expect(parseRange('').size).toBe(0);
  });
  test('is case-insensitive', () => {
    expect(parseRange(`${SUFFIX.toLowerCase()}:3`).get(SUFFIX)).toBe(3);
  });
});

describe('k-anonymity: what is sent', () => {
  test('only the first 5 characters of the hash, in the URL, with no body', async () => {
    const api = fakeApi({ [PREFIX]: `${SUFFIX}:10` });
    await findBreached(['password'], { fetchImpl: api.fetchImpl });
    expect(api.calls).toHaveLength(1);
    expect(api.calls[0]!.url).toBe(`https://api.pwnedpasswords.com/range/${PREFIX}`);
    expect(api.calls[0]!.init.method).toBe('GET');
    expect(api.calls[0]!.init.body).toBeUndefined();
    expect(api.calls[0]!.init.headers).toEqual({ 'Add-Padding': 'true' });
  });

  test('neither the password, the rest of the hash, nor anything else is in any request', async () => {
    const passwords = Array.from({ length: 40 }, (_, i) => `very-secret-pw-${i}`);
    const api = fakeApi({});
    await findBreached(passwords, { fetchImpl: api.fetchImpl });
    for (const { url, init } of api.calls) {
      expect(url).toMatch(/^https:\/\/api\.pwnedpasswords\.com\/range\/[0-9A-F]{5}$/);
      expect(JSON.stringify(init)).not.toMatch(/secret|[0-9A-F]{8}/);
    }
    for (const password of passwords) {
      const hash = sha1Upper(password);
      for (const { url } of api.calls) expect(url).not.toContain(hash.slice(5, 12));
    }
  });

  test('passwords that share a prefix cost one request; repeats and empties cost none', async () => {
    // find two different passwords whose hashes start with the same 5 characters
    const seen = new Map<string, string>();
    let pair: [string, string] | null = null;
    for (let i = 0; !pair; i++) {
      const pw = `pw-${i}`;
      const prefix = sha1Upper(pw).slice(0, 5);
      const other = seen.get(prefix);
      if (other) pair = [other, pw];
      else seen.set(prefix, pw);
    }
    const api = fakeApi({});
    await findBreached([pair[0], pair[1], pair[0], '', pair[1]], { fetchImpl: api.fetchImpl });
    expect(api.calls).toHaveLength(1);
  });
});

describe('finding breached passwords', () => {
  test('reports the hash and count of a password that is on the list', async () => {
    const api = fakeApi({ [PREFIX]: `${PAD}:0\n${SUFFIX}:9545824\n${'C'.repeat(35)}:7` });
    const found = await findBreached(['password', 'a-very-unusual-passphrase-7731'], {
      fetchImpl: api.fetchImpl,
    });
    expect([...found]).toEqual([[PASSWORD_HASH, 9545824]]);
  });

  test('a password that is not on the list is absent, and padding rows never match', async () => {
    const hash = sha1Upper('unlisted-one');
    const api = fakeApi({ [hash.slice(0, 5)]: `${hash.slice(5)}:0\n${'D'.repeat(35)}:4` });
    expect((await findBreached(['unlisted-one'], { fetchImpl: api.fetchImpl })).size).toBe(0);
  });

  test('nothing to check means no request at all', async () => {
    const api = fakeApi({});
    expect((await findBreached([], { fetchImpl: api.fetchImpl })).size).toBe(0);
    expect((await findBreached([''], { fetchImpl: api.fetchImpl })).size).toBe(0);
    expect(api.calls).toHaveLength(0);
  });

  test('reports progress and never runs more than 4 requests at once', async () => {
    const passwords = Array.from({ length: 30 }, (_, i) => `pw-${i}`);
    const api = fakeApi({});
    const progress: [number, number][] = [];
    await findBreached(passwords, {
      fetchImpl: api.fetchImpl,
      onProgress: (done, total) => progress.push([done, total]),
    });
    const total = api.calls.length;
    expect(progress[0]).toEqual([0, total]);
    expect(progress.at(-1)).toEqual([total, total]);
    expect(api.maxInFlight()).toBeLessThanOrEqual(4);
    expect(api.maxInFlight()).toBeGreaterThan(1);
  });
});

describe('failures', () => {
  const kindOf = async (run: () => Promise<unknown>) => {
    try {
      await run();
    } catch (e) {
      return e instanceof BreachCheckError ? e.kind : 'other';
    }
    return 'no error';
  };

  test('no internet', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    expect(await kindOf(() => findBreached(['password'], { fetchImpl }))).toBe('offline');
  });

  test.each([
    [429, 'rate-limited'],
    [500, 'server'],
    [503, 'server'],
    [404, 'server'],
  ])('HTTP %i becomes %s', async (status, kind) => {
    const api = fakeApi({}, () => new Response('', { status }));
    expect(await kindOf(() => findBreached(['password'], { fetchImpl: api.fetchImpl }))).toBe(kind);
  });

  test('one failed request fails the whole check, so a partial result never looks like "all clear"', async () => {
    const passwords = Array.from({ length: 12 }, (_, i) => `pw-${i}`);
    let n = 0;
    const api = fakeApi({}, () => (++n === 5 ? new Response('', { status: 500 }) : undefined));
    expect(await kindOf(() => findBreached(passwords, { fetchImpl: api.fetchImpl }))).toBe(
      'server',
    );
  });

  test('stopping cancels the check', async () => {
    const passwords = Array.from({ length: 20 }, (_, i) => `pw-${i}`);
    const controller = new AbortController();
    const api = fakeApi({});
    const run = findBreached(passwords, {
      fetchImpl: api.fetchImpl,
      signal: controller.signal,
      concurrency: 1,
      onProgress: (done) => done === 2 && controller.abort(),
    });
    expect(await kindOf(() => run)).toBe('cancelled');
    expect(api.calls.length).toBeLessThan(20);
  });

  test('a request that never answers gives up as offline', async () => {
    jest.useFakeTimers();
    try {
      const fetchImpl = jest.fn(
        (_url: unknown, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      ) as unknown as typeof fetch;
      const outcome = kindOf(() => fetchRange(PREFIX, fetchImpl));
      await jest.advanceTimersByTimeAsync(16_000);
      expect(await outcome).toBe('offline');
    } finally {
      jest.useRealTimers();
    }
  });

  test('errors carry no password, hash or reply text', async () => {
    const api = fakeApi({}, () => new Response('secret-reply', { status: 500 }));
    const error = await findBreached(['password'], { fetchImpl: api.fetchImpl }).catch((e) => e);
    expect(JSON.stringify([error.message, error.kind])).not.toMatch(/password|5BAA|secret-reply/i);
  });

  test('a bad prefix is refused before any request', async () => {
    const api = fakeApi({});
    await expect(fetchRange('5BAA', api.fetchImpl)).rejects.toThrow(RangeError);
    await expect(fetchRange('xyz12', api.fetchImpl)).rejects.toThrow(RangeError);
    expect(api.calls).toHaveLength(0);
  });
});
