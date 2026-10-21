import { BACKUP_FILE_NAME, buildMultipart, createDriveClient, MAX_BACKUP_BYTES } from '../driveApi';
import { BackupError } from '../errors';
import { parseMultipart, resetFakes, testDrive, testGoogle } from '../__support__/fakeGoogle';

const client = () => createDriveClient(testGoogle, testDrive.fetch as unknown as typeof fetch);
const meta = { revision: 1, deviceId: 'ab12cd', deviceName: 'Pixel 8 (ab12)' };
const bytes = (...values: number[]) => Uint8Array.from(values);
// Every byte value, including the ones that look like line breaks and dashes.
const binary = Uint8Array.from({ length: 600 }, (_, i) => i % 256);

beforeEach(() => {
  resetFakes();
  testGoogle.state.signedIn = true;
});

describe('find', () => {
  test('returns null when there is no backup', async () => {
    expect(await client().find()).toBeNull();
  });

  test('returns the newest backup', async () => {
    testDrive.putFile(bytes(1));
    const newest = testDrive.putFile(bytes(2));
    expect(await client().find()).toMatchObject({
      id: newest.id,
      modifiedTime: newest.modifiedTime,
    });
  });

  test('only looks in the hidden app folder, by name, and never lists anything else', async () => {
    testDrive.putFile(bytes(1), {}, 'some-other-file');
    expect(await client().find()).toBeNull();
    const url = new URL(testDrive.requests[0]!.url);
    expect(url.origin + url.pathname).toBe('https://www.googleapis.com/drive/v3/files');
    expect(url.searchParams.get('spaces')).toBe('appDataFolder');
    expect(url.searchParams.get('q')).toContain(BACKUP_FILE_NAME);
  });
});

describe('upload', () => {
  test('creates the file in the app folder with exactly the bytes given', async () => {
    const result = await client().upload(binary, meta);
    const stored = testDrive.only();
    expect(stored.bytes).toEqual(binary);
    expect(stored.parents).toEqual(['appDataFolder']);
    expect(stored.name).toBe(BACKUP_FILE_NAME);
    expect(result).toMatchObject({ id: stored.id, modifiedTime: stored.modifiedTime });
  });

  test('is a single request that creates the file and its content together', async () => {
    await client().upload(binary, meta);
    expect(testDrive.requests).toHaveLength(1);
    const request = testDrive.requests[0]!;
    expect(request.method).toBe('POST');
    expect(request.contentType).toMatch(/^multipart\/related; boundary=kitevault-[0-9a-f]{32}$/);
  });

  test('uploading again with the file id replaces the content of the same file', async () => {
    const first = await client().upload(bytes(1, 2, 3), meta);
    const second = await client().upload(bytes(9, 9), meta, first.id);
    expect(testDrive.files.size).toBe(1);
    expect(testDrive.only().bytes).toEqual(bytes(9, 9));
    expect(second.id).toBe(first.id);
    expect(second.modifiedTime > first.modifiedTime).toBe(true);
    expect(testDrive.requests.at(-1)!.method).toBe('PATCH');
  });

  test('if the file was deleted meanwhile, it makes a new one', async () => {
    const result = await client().upload(bytes(5), meta, 'file-that-is-gone');
    expect(testDrive.only().bytes).toEqual(bytes(5));
    expect(result.id).not.toBe('file-that-is-gone');
  });

  test('only ever talks to the Drive API on googleapis.com', async () => {
    await client().find();
    await client().upload(bytes(1), meta);
    for (const request of testDrive.requests) {
      expect(new URL(request.url).origin).toBe('https://www.googleapis.com');
    }
  });
});

describe('versions', () => {
  test('labels each version with revision, device and time', async () => {
    const result = await client().upload(bytes(1), meta);
    expect(testDrive.only().appProperties).toEqual({
      revision: '1',
      deviceId: 'ab12cd',
      deviceName: 'Pixel 8 (ab12)',
    });
    expect(result).toMatchObject({ revision: 1, deviceId: 'ab12cd', deviceName: 'Pixel 8 (ab12)' });
    expect(Date.parse(result.createdTime)).not.toBeNaN();
  });

  test('uploads without an id add versions; list returns newest first', async () => {
    const a = await client().upload(bytes(1), meta);
    const b = await client().upload(bytes(2), { ...meta, revision: 2 });
    expect(testDrive.files.size).toBe(2);
    expect((await client().list()).map((v) => v.id)).toEqual([b.id, a.id]);
  });

  test('replacing in place updates the labels too', async () => {
    const a = await client().upload(bytes(1), meta);
    await client().upload(bytes(2), { ...meta, revision: 7 }, a.id);
    expect(testDrive.only().appProperties.revision).toBe('7');
  });

  test('prune keeps only the newest versions', async () => {
    for (let i = 1; i <= 7; i++) await client().upload(bytes(i), { ...meta, revision: i });
    expect(await client().prune(5)).toBe(2);
    expect(testDrive.files.size).toBe(5);
    expect((await client().list()).map((v) => v.revision)).toEqual([7, 6, 5, 4, 3]);
    expect(await client().prune(5)).toBe(0);
  });

  test('a very long device name is cut to fit the 124-byte limit', async () => {
    await client().upload(bytes(1), { ...meta, deviceName: 'é'.repeat(200) });
    const name = testDrive.only().appProperties.deviceName!;
    expect(new TextEncoder().encode('deviceName' + name).length).toBeLessThanOrEqual(124);
  });

  test('a file without labels (older app) has revision 0', async () => {
    testDrive.putFile(bytes(1));
    expect(await client().find()).toMatchObject({ revision: 0, deviceId: '', deviceName: '' });
  });
});

describe('multipart body', () => {
  test('round trips arbitrary binary data, even data that contains boundary-like text', () => {
    const tricky = new TextEncoder().encode('--abc\r\n--abc--\r\n\r\n');
    const content = Uint8Array.from([...binary, ...tricky, 13, 10, 45, 45]);
    const { body, boundary } = buildMultipart({ name: 'x' }, content);
    const parsed = parseMultipart(body, boundary);
    expect(parsed.content).toEqual(content);
    expect(parsed.metadata).toEqual({ name: 'x' });
  });

  test('picks a new boundary if the content happens to contain the first one', () => {
    jest.resetModules();
    jest.doMock('@/crypto', () => {
      const actual = jest.requireActual('@/crypto');
      let calls = 0;
      return {
        ...actual,
        generateRandomBytes: (n: number) => new Uint8Array(n).fill(calls++ === 0 ? 0xaa : 0xbb), // 1st boundary, then a different one
      };
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { buildMultipart: build } = require('../driveApi') as typeof import('../driveApi');
    const firstBoundary = `kitevault-${'aa'.repeat(16)}`;
    const content = new TextEncoder().encode(`data ${firstBoundary} data`);
    const { boundary } = build({ name: 'x' }, content);
    expect(boundary).toBe(`kitevault-${'bb'.repeat(16)}`);
    jest.dontMock('@/crypto');
  });
});

describe('download', () => {
  test('returns exactly the stored bytes', async () => {
    const file = testDrive.putFile(binary);
    expect(await client().download(file.id)).toEqual(binary);
  });

  test('a missing file is "not found"', async () => {
    await expect(client().download('nope')).rejects.toMatchObject({ kind: 'not-found' });
  });

  test('refuses something absurdly large', async () => {
    const file = testDrive.putFile(bytes(1));
    testDrive.fetch.mockImplementationOnce(
      async () =>
        ({
          ok: true,
          status: 200,
          headers: { get: () => String(MAX_BACKUP_BYTES + 1) },
          arrayBuffer: async () => new ArrayBuffer(1),
        }) as unknown as Response,
    );
    await expect(client().download(file.id)).rejects.toMatchObject({ kind: 'invalid-backup' });
  });
});

describe('deleteAll', () => {
  test('deletes every backup file, including duplicates, and nothing else', async () => {
    testDrive.putFile(bytes(1));
    testDrive.putFile(bytes(2));
    testDrive.putFile(bytes(3), {}, 'unrelated');
    expect(await client().deleteAll()).toBe(2);
    expect([...testDrive.files.values()].map((f) => f.name)).toEqual(['unrelated']);
  });

  test('is fine when there is nothing to delete', async () => {
    expect(await client().deleteAll()).toBe(0);
  });

  test('a file that vanishes during the delete is not an error', async () => {
    testDrive.putFile(bytes(1));
    testDrive.onRequest = (request) => {
      if (request.method === 'DELETE') testDrive.files.clear(); // gone right after we listed it
    };
    await expect(client().deleteAll()).resolves.toBe(1);
  });
});

describe('expired sign-in tokens', () => {
  test('a rejected token is replaced once and the request is repeated', async () => {
    testDrive.putFile(bytes(1));
    testDrive.expireToken('token-2'); // the phone still holds token-1
    const found = await client().find();
    expect(found).not.toBeNull();
    expect(testGoogle.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(testGoogle.refreshAccessToken).toHaveBeenCalledWith('token-1');
    expect(testDrive.requests.map((r) => r.authorization)).toEqual([
      'Bearer token-1',
      'Bearer token-2',
    ]);
  });

  test('uploads survive an expired token too', async () => {
    testDrive.expireToken('token-2');
    await client().upload(binary, meta);
    expect(testDrive.only().bytes).toEqual(binary);
  });

  test('if the new token is rejected as well, it gives up with "auth-expired"', async () => {
    testDrive.onRequest = () => {
      testDrive.validToken = `never-matches-${Math.random()}`;
    };
    await expect(client().find()).rejects.toMatchObject({ kind: 'auth-expired' });
    expect(testGoogle.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(testDrive.requests).toHaveLength(2); // not an endless loop
  });

  test('if no new token can be had, that reason is reported', async () => {
    testDrive.expireToken('token-2');
    testGoogle.state.refreshError = new BackupError('access-revoked');
    await expect(client().find()).rejects.toMatchObject({ kind: 'access-revoked' });
  });
});

describe('errors', () => {
  test.each([
    [403, 'storageQuotaExceeded', 'quota'],
    [403, 'userRateLimitExceeded', 'rate-limited'],
    [403, 'rateLimitExceeded', 'rate-limited'],
    [429, undefined, 'rate-limited'],
    [403, 'accessNotConfigured', 'setup-error'],
    [403, 'insufficientPermissions', 'access-revoked'],
    [403, undefined, 'access-revoked'],
    [404, 'notFound', 'not-found'],
    [500, undefined, 'server'],
    [503, undefined, 'server'],
    [400, 'badRequest', 'unknown'],
  ] as const)('HTTP %i (%s) becomes "%s"', async (status, reason, kind) => {
    testDrive.failNext = { status, reason };
    await expect(client().find()).rejects.toMatchObject({ name: 'BackupError', kind, status });
  });

  test('no internet becomes "offline"', async () => {
    testDrive.offline = true;
    await expect(client().find()).rejects.toMatchObject({ kind: 'offline' });
    await expect(client().upload(bytes(1), meta)).rejects.toMatchObject({ kind: 'offline' });
    await expect(client().download('x')).rejects.toMatchObject({ kind: 'offline' });
  });

  test('a request that never answers gives up as "offline"', async () => {
    jest.useFakeTimers();
    try {
      testDrive.fetch.mockImplementationOnce(
        (_url: unknown, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      );
      const pending = client().find();
      const outcome = expect(pending).rejects.toMatchObject({ kind: 'offline' });
      await jest.advanceTimersByTimeAsync(21_000);
      await outcome;
    } finally {
      jest.useRealTimers();
    }
  });

  test('errors carry no token, URL or reply text', async () => {
    testDrive.failNext = { status: 403, reason: 'storageQuotaExceeded' };
    const error = await client()
      .find()
      .catch((e) => e);
    expect(JSON.stringify([error.message, error.status, error.kind])).not.toMatch(
      /token|Bearer|googleapis/,
    );
  });

  test('an unreadable reply from Drive is a server problem', async () => {
    testDrive.fetch.mockImplementationOnce(
      async () =>
        ({
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({ files: [{ nope: 1 }] }),
        }) as unknown as Response,
    );
    await expect(client().find()).rejects.toMatchObject({ kind: 'server' });
  });

  test('not signed in: no request is sent at all', async () => {
    testGoogle.state.signedIn = false;
    await expect(client().find()).rejects.toMatchObject({ kind: 'not-signed-in' });
    expect(testDrive.fetch).not.toHaveBeenCalled();
  });
});
