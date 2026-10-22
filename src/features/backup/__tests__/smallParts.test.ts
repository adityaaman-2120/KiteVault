import { BackupError, backupErrorKind, describeBackupError, type BackupErrorKind } from '../errors';

const KINDS: BackupErrorKind[] = [
  'unavailable',
  'cancelled',
  'not-signed-in',
  'scope-denied',
  'access-revoked',
  'auth-expired',
  'offline',
  'quota',
  'rate-limited',
  'server',
  'not-found',
  'invalid-backup',
  'conflict',
  'no-vault',
  'play-services',
  'setup-error',
  'busy',
  'unknown',
];

describe('backup errors', () => {
  test('every kind has its own plain-language text', () => {
    const texts = KINDS.map((kind) => describeBackupError(new BackupError(kind)));
    expect(new Set(texts).size).toBe(KINDS.length);
    for (const text of texts) expect(text.length).toBeGreaterThan(15);
  });

  test('anything that is not a BackupError is "unknown", and its details are never shown', () => {
    expect(backupErrorKind(new Error('token=abc123'))).toBe('unknown');
    expect(backupErrorKind('text')).toBe('unknown');
    expect(backupErrorKind(null)).toBe('unknown');
    expect(describeBackupError(new Error('token=abc123'))).not.toContain('abc123');
  });

  test('a BackupError carries only its kind and an optional HTTP status', () => {
    const error = new BackupError('quota', 403);
    expect(error).toMatchObject({ name: 'BackupError', kind: 'quota', status: 403 });
    expect(error.message).toBe('Backup error: quota');
    expect(backupErrorKind(error)).toBe('quota');
  });
});

describe('device label', () => {
  const load = (modelName: unknown, throws = false) => {
    let label!: (id: string) => string;
    jest.isolateModules(() => {
      jest.doMock('expo-device', () => ({
        get modelName() {
          if (throws) throw new Error('no device info');
          return modelName;
        },
      }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      label = (require('../deviceInfo') as typeof import('../deviceInfo')).deviceLabel;
    });
    return label;
  };
  afterEach(() => jest.dontMock('expo-device'));

  test('is the phone model plus four characters of the random id', () => {
    expect(load('Pixel 8')('abcdef0123')).toBe('Pixel 8 (abcd)');
  });

  test('falls back to a generic name when the model is unknown, blank or unreadable', () => {
    expect(load(null)('abcdef')).toBe('Android phone (abcd)');
    expect(load('   ')('abcdef')).toBe('Android phone (abcd)');
    expect(load(undefined, true)('abcdef')).toBe('Android phone (abcd)');
  });

  test('a short id is used as it is', () => {
    expect(load('Pixel')('ab')).toBe('Pixel (ab)');
  });
});
