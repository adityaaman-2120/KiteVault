import { generateRandomBytes, utf8Encode } from '@/crypto';

import { BackupError } from './errors';
import type { GoogleAuth } from './googleAuth';

// A very small client for the Google Drive v3 REST API, using plain fetch. It only ever touches
// the hidden "appDataFolder" that the drive.appdata permission gives access to, and only sends
// the already-encrypted vault file. Tokens go in the Authorization header and nowhere else.
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
export const BACKUP_FILE_NAME = 'kitevault-backup.kvlt';

const SHORT_TIMEOUT_MS = 20_000;
const TRANSFER_TIMEOUT_MS = 60_000;
// A real vault is a few hundred KB at most; anything near this is not one.
export const MAX_BACKUP_BYTES = 64 * 1024 * 1024;

// One saved version of the vault in Drive. revision, deviceId and deviceName come from the file's
// app properties (plain labels, not secret); a file made by an older app version has none of them.
export type RemoteBackup = {
  id: string;
  modifiedTime: string;
  createdTime: string;
  size: number;
  revision: number;
  deviceId: string;
  deviceName: string;
};

export type VersionMeta = { revision: number; deviceId: string; deviceName: string };

// Drive allows 124 bytes for a property's name and value together.
const MAX_PROPERTY_VALUE_BYTES = 100;

export type DriveClient = {
  // Every saved version, newest first.
  list(): Promise<RemoteBackup[]>;
  // The newest version, or null.
  find(): Promise<RemoteBackup | null>;
  // Saves `bytes` as a NEW version, or, with existingId, replaces the content of that version.
  upload(bytes: Uint8Array, meta: VersionMeta, existingId?: string): Promise<RemoteBackup>;
  // Deletes the versions beyond the newest `keep`. Returns how many were deleted.
  prune(keep: number): Promise<number>;
  download(id: string): Promise<Uint8Array>;
  // Deletes every KiteVault backup file in the hidden folder. Returns how many were deleted.
  deleteAll(): Promise<number>;
};

// Cuts text to at most `maxBytes` of UTF-8 without splitting a character.
export function fitBytes(text: string, maxBytes: number): string {
  let out = '';
  let used = 0;
  for (const char of text) {
    const size = utf8Encode(char).length;
    if (used + size > maxBytes) break;
    out += char;
    used += size;
  }
  return out;
}

type FetchLike = typeof fetch;

type DriveErrorBody = { error?: { errors?: { reason?: string }[]; status?: string } };

// Maps a failed Drive reply to a kind. Looks only at the status and Google's machine-readable
// reason, never at the message text, and never keeps the body.
async function toError(response: Response): Promise<BackupError> {
  let reason = '';
  try {
    const body = (await response.json()) as DriveErrorBody;
    reason = body.error?.errors?.[0]?.reason ?? body.error?.status ?? '';
  } catch {
    // No readable body: the status alone decides.
  }
  const { status } = response;
  if (reason === 'storageQuotaExceeded') return new BackupError('quota', status);
  if (
    status === 429 ||
    [
      'userRateLimitExceeded',
      'rateLimitExceeded',
      'sharingRateLimitExceeded',
      'dailyLimitExceeded',
    ].includes(reason)
  ) {
    return new BackupError('rate-limited', status);
  }
  // The Drive API switched off in the project: a setup problem, not the user's fault.
  if (reason === 'accessNotConfigured' || reason === 'SERVICE_DISABLED') {
    return new BackupError('setup-error', status);
  }
  if (status === 401) return new BackupError('auth-expired', status);
  if (status === 403) return new BackupError('access-revoked', status);
  if (status === 404) return new BackupError('not-found', status);
  if (status >= 500) return new BackupError('server', status);
  return new BackupError('unknown', status);
}

async function send(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch {
    // fetch only throws when no reply came at all: no connection, or the timeout above.
    throw new BackupError('offline');
  } finally {
    clearTimeout(timer);
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

function includesText(haystack: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

// One request that creates the file with its content: either the whole file arrives or none.
export function buildMultipart(
  metadata: object,
  content: Uint8Array,
): { body: Uint8Array; boundary: string } {
  let boundary = `kitevault-${hex(generateRandomBytes(16))}`;
  while (includesText(content, utf8Encode(boundary)))
    boundary = `kitevault-${hex(generateRandomBytes(16))}`;
  const head = utf8Encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
  );
  const tail = utf8Encode(`\r\n--${boundary}--`);
  return { body: concat([head, content, tail]), boundary };
}

const FIELDS = 'id,modifiedTime,createdTime,size,appProperties';

const parseBackup = (value: unknown): RemoteBackup => {
  const file = value as {
    id?: unknown;
    modifiedTime?: unknown;
    createdTime?: unknown;
    size?: unknown;
    appProperties?: Record<string, unknown>;
  };
  if (typeof file?.id !== 'string' || typeof file.modifiedTime !== 'string') {
    throw new BackupError('server');
  }
  const props = file.appProperties ?? {};
  const revision = Number(props.revision);
  return {
    id: file.id,
    modifiedTime: file.modifiedTime,
    createdTime: typeof file.createdTime === 'string' ? file.createdTime : file.modifiedTime,
    size: Number(file.size ?? 0),
    revision: Number.isInteger(revision) && revision > 0 ? revision : 0,
    deviceId: typeof props.deviceId === 'string' ? props.deviceId : '',
    deviceName: typeof props.deviceName === 'string' ? props.deviceName : '',
  };
};

const toProperties = (meta: VersionMeta) => ({
  revision: String(meta.revision),
  deviceId: fitBytes(meta.deviceId, MAX_PROPERTY_VALUE_BYTES),
  deviceName: fitBytes(meta.deviceName, MAX_PROPERTY_VALUE_BYTES),
});

export function createDriveClient(auth: GoogleAuth, fetchImpl: FetchLike = fetch): DriveClient {
  // Sends a request with a fresh token; on 401 gets a new token once and tries again.
  async function request(
    url: string,
    init: RequestInit & { headers?: Record<string, string> },
    timeoutMs = SHORT_TIMEOUT_MS,
  ): Promise<Response> {
    let token = await auth.getAccessToken();
    const attempt = (t: string) =>
      send(
        fetchImpl,
        url,
        { ...init, headers: { ...init.headers, Authorization: `Bearer ${t}` } },
        timeoutMs,
      );

    let response = await attempt(token);
    if (response.status === 401) {
      token = await auth.refreshAccessToken(token);
      response = await attempt(token);
    }
    if (!response.ok) throw await toError(response);
    return response;
  }

  async function list(): Promise<RemoteBackup[]> {
    const query = new URLSearchParams({
      spaces: 'appDataFolder',
      q: `name = '${BACKUP_FILE_NAME}' and trashed = false`,
      fields: `files(${FIELDS})`,
      orderBy: 'modifiedTime desc',
      pageSize: '50',
    });
    const response = await request(`${API}/files?${query}`, { method: 'GET' });
    const body = (await response.json()) as { files?: unknown[] };
    return (body.files ?? []).map(parseBackup);
  }

  return {
    list,

    async find() {
      return (await list())[0] ?? null;
    },

    async upload(bytes, meta, existingId) {
      const properties = toProperties(meta);
      const multipart = (metadata: object) => buildMultipart(metadata, bytes);
      if (existingId) {
        try {
          const { body, boundary } = multipart({ appProperties: properties });
          const response = await request(
            `${UPLOAD}/files/${encodeURIComponent(existingId)}?uploadType=multipart&fields=${FIELDS}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
              body: body as unknown as BodyInit,
            },
            TRANSFER_TIMEOUT_MS,
          );
          return parseBackup(await response.json());
        } catch (error) {
          // The version was deleted since we looked: make a new one instead.
          if (!(error instanceof BackupError && error.kind === 'not-found')) throw error;
        }
      }
      const { body, boundary } = multipart({
        name: BACKUP_FILE_NAME,
        parents: ['appDataFolder'],
        mimeType: 'application/octet-stream',
        appProperties: properties,
      });
      const response = await request(
        `${UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`,
        {
          method: 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
          body: body as unknown as BodyInit,
        },
        TRANSFER_TIMEOUT_MS,
      );
      return parseBackup(await response.json());
    },

    async prune(keep) {
      const old = (await list()).slice(keep);
      let deleted = 0;
      for (const file of old) {
        try {
          await request(`${API}/files/${encodeURIComponent(file.id)}`, { method: 'DELETE' });
          deleted++;
        } catch (error) {
          if (!(error instanceof BackupError && error.kind === 'not-found')) throw error;
        }
      }
      return deleted;
    },

    async download(id) {
      const response = await request(
        `${API}/files/${encodeURIComponent(id)}?alt=media`,
        { method: 'GET' },
        TRANSFER_TIMEOUT_MS,
      );
      const length = Number(response.headers.get('content-length') ?? 0);
      if (length > MAX_BACKUP_BYTES) throw new BackupError('invalid-backup');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > MAX_BACKUP_BYTES) throw new BackupError('invalid-backup');
      return bytes;
    },

    async deleteAll() {
      const files = await list();
      for (const file of files) {
        try {
          await request(`${API}/files/${encodeURIComponent(file.id)}`, { method: 'DELETE' });
        } catch (error) {
          if (!(error instanceof BackupError && error.kind === 'not-found')) throw error; // already gone
        }
      }
      return files.length;
    },
  };
}
