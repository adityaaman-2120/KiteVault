import { BackupError } from '../errors';
import type { GoogleAuth } from '../googleAuth';

// A pretend Google Drive (appDataFolder only) and a pretend Google sign-in, for unit tests. The
// drive speaks the same URLs and JSON as the real REST API for the calls KiteVault makes, and it
// records what it was sent so tests can check exactly what left the phone.

type StoredFile = {
  id: string;
  name: string;
  parents: string[];
  bytes: Uint8Array;
  modifiedTime: string;
  createdTime: string;
  appProperties: Record<string, string>;
};
type Failure = { status: number; reason?: string };

export type RecordedRequest = {
  method: string;
  url: string;
  authorization: string | null;
  contentType: string | null;
  body: Uint8Array | null;
};

const encoder = new TextEncoder();

// Drive allows 124 bytes for a property's name and value together.
const validProperties = (properties: Record<string, string>) =>
  Object.entries(properties).every(
    ([key, value]) => new TextEncoder().encode(key + value).length <= 124,
  );
const decoder = new TextDecoder();

function indexOf(haystack: Uint8Array, needle: Uint8Array, from = 0): number {
  outer: for (let i = from; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

// Splits a multipart/related body into its JSON metadata and its binary content.
export function parseMultipart(body: Uint8Array, boundary: string) {
  const marker = encoder.encode(`--${boundary}`);
  const first = indexOf(body, marker);
  const second = indexOf(body, marker, first + marker.length);
  const closing = indexOf(body, encoder.encode(`\r\n--${boundary}--`), second + marker.length);
  const blank = encoder.encode('\r\n\r\n');
  const metaStart = indexOf(body, blank, first) + 4;
  const metaEnd = indexOf(body, encoder.encode('\r\n'), metaStart);
  const contentStart = indexOf(body, blank, second) + 4;
  return {
    metadata: JSON.parse(decoder.decode(body.slice(metaStart, metaEnd))) as Record<string, unknown>,
    content: body.slice(contentStart, closing),
  };
}

export function createFakeDrive() {
  const files = new Map<string, StoredFile>();
  let nextId = 1;
  let clock = Date.UTC(2026, 9, 22, 10, 0, 0);

  const drive = {
    files,
    requests: [] as RecordedRequest[],
    // Switches for the tests:
    offline: false,
    validToken: 'token-1',
    failNext: null as Failure | null,
    onRequest: null as ((request: RecordedRequest) => void) | null,

    tick() {
      clock += 60_000;
      return new Date(clock).toISOString();
    },
    // Another phone uploads a backup.
    // Another phone (or an older app version) uploads a backup.
    putFile(
      bytes: Uint8Array,
      appProperties: Record<string, string> = {},
      name = 'kitevault-backup.kvlt',
    ): StoredFile {
      const time = drive.tick();
      const file = {
        id: `file-${nextId++}`,
        name,
        parents: ['appDataFolder'],
        bytes,
        modifiedTime: time,
        createdTime: time,
        appProperties,
      };
      files.set(file.id, file);
      return file;
    },
    newest(): StoredFile {
      return [...files.values()].sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime))[0]!;
    },
    expireToken(next = `token-${nextId++}`) {
      drive.validToken = next;
    },
    only(): StoredFile {
      const all = [...files.values()];
      if (all.length !== 1) throw new Error(`expected 1 file, found ${all.length}`);
      return all[0]!;
    },

    fetch: jest.fn(async (input: unknown, init: RequestInit = {}): Promise<Response> => {
      const url = String(input);
      const headers = (init.headers ?? {}) as Record<string, string>;
      const body = init.body instanceof Uint8Array ? init.body : null;
      const recorded: RecordedRequest = {
        method: init.method ?? 'GET',
        url,
        authorization: headers.Authorization ?? null,
        contentType: headers['Content-Type'] ?? null,
        body,
      };
      drive.requests.push(recorded);
      drive.onRequest?.(recorded);

      if (drive.offline) throw new TypeError('Network request failed');
      const reply = (status: number, json?: unknown, bytes?: Uint8Array) =>
        ({
          ok: status >= 200 && status < 300,
          status,
          headers: {
            get: (name: string) =>
              name.toLowerCase() === 'content-length' && bytes ? String(bytes.length) : null,
          },
          json: async () => json,
          arrayBuffer: async () => (bytes ?? new Uint8Array()).slice().buffer,
        }) as unknown as Response;
      const fail = (status: number, reason?: string) =>
        reply(status, { error: { code: status, errors: reason ? [{ reason }] : [] } });

      if (drive.failNext) {
        const failure = drive.failNext;
        drive.failNext = null;
        return fail(failure.status, failure.reason);
      }
      if (recorded.authorization !== `Bearer ${drive.validToken}`) return fail(401, 'authError');

      const parsed = new URL(url);
      const view = (f: StoredFile) => ({
        id: f.id,
        modifiedTime: f.modifiedTime,
        createdTime: f.createdTime,
        appProperties: f.appProperties,
        size: String(f.bytes.length),
      });
      const method = recorded.method;
      const idMatch = /\/files\/([^/?]+)$/.exec(parsed.pathname);

      // list
      if (method === 'GET' && parsed.pathname === '/drive/v3/files') {
        if (parsed.searchParams.get('spaces') !== 'appDataFolder') return fail(400, 'badRequest');
        const name = /name = '([^']+)'/.exec(parsed.searchParams.get('q') ?? '')?.[1];
        const found = [...files.values()]
          .filter((f) => f.name === name)
          .sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime))
          .slice(0, Number(parsed.searchParams.get('pageSize') ?? 100));
        return reply(200, { files: found.map(view) });
      }
      // create (multipart)
      if (method === 'POST' && parsed.pathname === '/upload/drive/v3/files') {
        const boundary = /boundary=(.+)$/.exec(recorded.contentType ?? '')?.[1];
        if (!boundary || !body) return fail(400, 'badRequest');
        const { metadata, content } = parseMultipart(body, boundary);
        if (JSON.stringify(metadata.parents) !== '["appDataFolder"]') return fail(403, 'forbidden');
        const properties = (metadata.appProperties ?? {}) as Record<string, string>;
        if (!validProperties(properties)) return fail(400, 'badRequest');
        const file = drive.putFile(content, properties, String(metadata.name));
        return reply(200, view(file));
      }
      // update (multipart: new content and new labels together)
      if (method === 'PATCH' && idMatch && parsed.pathname.startsWith('/upload/drive/v3/files/')) {
        const file = files.get(decodeURIComponent(idMatch[1]!));
        if (!file) return fail(404, 'notFound');
        const boundary = /boundary=(.+)$/.exec(recorded.contentType ?? '')?.[1];
        if (!boundary || !body) return fail(400, 'badRequest');
        const { metadata, content } = parseMultipart(body, boundary);
        const properties = (metadata.appProperties ?? {}) as Record<string, string>;
        if (!validProperties(properties)) return fail(400, 'badRequest');
        file.bytes = content;
        file.appProperties = { ...file.appProperties, ...properties };
        file.modifiedTime = drive.tick();
        return reply(200, view(file));
      }
      // download
      if (method === 'GET' && idMatch && parsed.searchParams.get('alt') === 'media') {
        const file = files.get(decodeURIComponent(idMatch[1]!));
        return file ? reply(200, undefined, file.bytes) : fail(404, 'notFound');
      }
      // delete
      if (method === 'DELETE' && idMatch) {
        return files.delete(decodeURIComponent(idMatch[1]!)) ? reply(204) : fail(404, 'notFound');
      }
      return fail(400, 'badRequest');
    }),
  };
  return drive;
}

export type FakeDrive = ReturnType<typeof createFakeDrive>;

// A pretend Google sign-in. Its token is only good while it matches the drive's current token,
// like a real access token that expires.
export function createFakeGoogle(drive: FakeDrive) {
  const state = {
    signedIn: false,
    email: 'someone@example.com',
    cachedToken: 'token-1',
    signInError: null as BackupError | null,
    refreshError: null as BackupError | null,
  };
  const google = {
    state,
    signIn: jest.fn(async () => {
      if (state.signInError) throw state.signInError;
      state.signedIn = true;
      state.cachedToken = drive.validToken;
      return { email: state.email };
    }),
    signInSilently: jest.fn(async () => (state.signedIn ? { email: state.email } : null)),
    currentEmail: jest.fn(() => (state.signedIn ? state.email : null)),
    getAccessToken: jest.fn(async () => {
      if (!state.signedIn) throw new BackupError('not-signed-in');
      return state.cachedToken;
    }),
    refreshAccessToken: jest.fn(async (_stale: string) => {
      if (state.refreshError) throw state.refreshError;
      if (!state.signedIn) throw new BackupError('not-signed-in');
      state.cachedToken = drive.validToken;
      return state.cachedToken;
    }),
    signOut: jest.fn(async () => {
      state.signedIn = false;
    }),
    revokeAccess: jest.fn(async () => {
      state.signedIn = false;
    }),
  } satisfies GoogleAuth & { state: typeof state };
  return google;
}

export type FakeGoogle = ReturnType<typeof createFakeGoogle>;

// One shared pretend Drive and sign-in, so a test file can point the app's module at them with
// jest.mock and still reach them from the test body.
export const testDrive = createFakeDrive();
export const testGoogle = createFakeGoogle(testDrive);

export function resetFakes(): void {
  testDrive.files.clear();
  testDrive.requests.length = 0;
  testDrive.offline = false;
  testDrive.validToken = 'token-1';
  testDrive.failNext = null;
  testDrive.onRequest = null;
  testDrive.fetch.mockClear();
  Object.assign(testGoogle.state, {
    signedIn: false,
    email: 'someone@example.com',
    cachedToken: 'token-1',
    signInError: null,
    refreshError: null,
  });
  for (const key of [
    'signIn',
    'signInSilently',
    'currentEmail',
    'getAccessToken',
    'refreshAccessToken',
    'signOut',
    'revokeAccess',
  ] as const) {
    testGoogle[key].mockClear();
  }
}
