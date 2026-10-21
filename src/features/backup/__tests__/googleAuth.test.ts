import { BackupError } from '../errors';
import { DRIVE_APPDATA_SCOPE, googleAuth, translateGoogleError } from '../googleAuth';

const mockLib = {
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
    SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
  },
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => true),
    signIn: jest.fn(),
    addScopes: jest.fn(),
    signInSilently: jest.fn(),
    getCurrentUser: jest.fn(),
    getTokens: jest.fn(),
    clearCachedAccessToken: jest.fn(async () => null),
    signOut: jest.fn(async () => null),
    revokeAccess: jest.fn(async () => null),
  },
};
jest.mock('@react-native-google-signin/google-signin', () => mockLib);
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { cloudBackup: { enabled: true, webClientId: '' } } } },
}));

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const lib = mockLib.GoogleSignin;
const user = (scopes: string[]) => ({ user: { email: 'a@example.com' }, scopes });
const success = (scopes: string[]) => ({ type: 'success' as const, data: user(scopes) });
const codeError = (code: string, message = '') => Object.assign(new Error(message), { code });

beforeEach(() => {
  for (const fn of Object.values(lib)) (fn as jest.Mock).mockReset();
  lib.hasPlayServices.mockResolvedValue(true);
  lib.clearCachedAccessToken.mockResolvedValue(null);
});

test('the only permission asked for is the hidden app folder of Google Drive', () => {
  expect(DRIVE_APPDATA_SCOPE).toBe(SCOPE);
});

describe('configuration', () => {
  test('asks for the Drive app-data scope and nothing else', async () => {
    lib.signIn.mockResolvedValue(success([SCOPE]));
    await googleAuth.signIn();
    await googleAuth.signIn();
    expect(lib.configure).toHaveBeenCalledTimes(1); // configured once, not on every call
    expect(lib.configure).toHaveBeenCalledWith({ scopes: [SCOPE] });
    const options = lib.configure.mock.calls[0][0];
    expect(options.scopes).toHaveLength(1);
    expect(options).not.toHaveProperty('offlineAccess'); // no server access, no refresh token for us
  });
});

describe('signIn', () => {
  test('returns the account email', async () => {
    lib.signIn.mockResolvedValue(success([SCOPE, 'email']));
    expect(await googleAuth.signIn()).toEqual({ email: 'a@example.com' });
    expect(lib.hasPlayServices).toHaveBeenCalledWith({ showPlayServicesUpdateDialog: true });
  });

  test('cancelling is "cancelled"', async () => {
    lib.signIn.mockResolvedValue({ type: 'cancelled', data: null });
    await expect(googleAuth.signIn()).rejects.toMatchObject({ kind: 'cancelled' });
    lib.signIn.mockRejectedValue(codeError('SIGN_IN_CANCELLED'));
    await expect(googleAuth.signIn()).rejects.toMatchObject({ kind: 'cancelled' });
  });

  test('if the Drive permission was unticked it asks again', async () => {
    lib.signIn.mockResolvedValue(success(['email']));
    lib.addScopes.mockResolvedValue(success(['email', SCOPE]));
    await expect(googleAuth.signIn()).resolves.toEqual({ email: 'a@example.com' });
    expect(lib.addScopes).toHaveBeenCalledWith({ scopes: [SCOPE] });
  });

  test('if it is still refused, sign-in fails with "scope-denied"', async () => {
    lib.signIn.mockResolvedValue(success(['email']));
    lib.addScopes.mockResolvedValue(success(['email']));
    await expect(googleAuth.signIn()).rejects.toMatchObject({ kind: 'scope-denied' });
    lib.addScopes.mockResolvedValue({ type: 'cancelled', data: null });
    await expect(googleAuth.signIn()).rejects.toMatchObject({ kind: 'scope-denied' });
  });

  test.each([
    [codeError('PLAY_SERVICES_NOT_AVAILABLE'), 'play-services'],
    [codeError('IN_PROGRESS'), 'busy'],
    [codeError('10', 'DEVELOPER_ERROR'), 'setup-error'],
    [new Error('DEVELOPER_ERROR: 10'), 'setup-error'],
    [codeError('7', 'network error'), 'offline'],
    [new Error('Unable to resolve host'), 'offline'],
    [new Error('something odd'), 'unknown'],
  ])('%p becomes "%s"', async (error, kind) => {
    lib.signIn.mockRejectedValue(error);
    await expect(googleAuth.signIn()).rejects.toMatchObject({ name: 'BackupError', kind });
  });
});

describe('signInSilently and currentEmail', () => {
  test('returns the account, or null when nobody is signed in', async () => {
    lib.signInSilently.mockResolvedValue(success([SCOPE]));
    expect(await googleAuth.signInSilently()).toEqual({ email: 'a@example.com' });
    lib.signInSilently.mockResolvedValue({ type: 'noSavedCredentialFound', data: null });
    expect(await googleAuth.signInSilently()).toBeNull();
    lib.signInSilently.mockRejectedValue(codeError('SIGN_IN_REQUIRED'));
    expect(await googleAuth.signInSilently()).toBeNull();
  });

  test('other problems are reported', async () => {
    lib.signInSilently.mockRejectedValue(new Error('Network is unreachable'));
    await expect(googleAuth.signInSilently()).rejects.toMatchObject({ kind: 'offline' });
  });

  test('currentEmail reads the cached user', () => {
    lib.getCurrentUser.mockReturnValue(user([SCOPE]));
    expect(googleAuth.currentEmail()).toBe('a@example.com');
    lib.getCurrentUser.mockReturnValue(null);
    expect(googleAuth.currentEmail()).toBeNull();
  });
});

describe('access tokens', () => {
  test('hands out the access token and nothing else', async () => {
    lib.getTokens.mockResolvedValue({ accessToken: 'ya29.token', idToken: 'ID' });
    expect(await googleAuth.getAccessToken()).toBe('ya29.token');
  });

  test('a missing sign-in is "not-signed-in", a network problem is "offline"', async () => {
    lib.getTokens.mockRejectedValue(new Error('getTokens requires a user to be signed in'));
    await expect(googleAuth.getAccessToken()).rejects.toMatchObject({ kind: 'not-signed-in' });
    lib.getTokens.mockRejectedValue(new Error('java.io.IOException: timeout'));
    await expect(googleAuth.getAccessToken()).rejects.toMatchObject({ kind: 'offline' });
  });

  test('any other failure means the sign-in or the permission is gone: "auth-expired"', async () => {
    lib.getTokens.mockRejectedValue(new Error('UserRecoverableAuthException: NeedPermission'));
    await expect(googleAuth.getAccessToken()).rejects.toMatchObject({ kind: 'auth-expired' });
  });

  test('refreshing clears the old token first and then gets a new one', async () => {
    lib.getTokens.mockResolvedValue({ accessToken: 'fresh', idToken: '' });
    expect(await googleAuth.refreshAccessToken('stale')).toBe('fresh');
    expect(lib.clearCachedAccessToken).toHaveBeenCalledWith('stale');
    expect(lib.clearCachedAccessToken.mock.invocationCallOrder[0]!).toBeLessThan(
      lib.getTokens.mock.invocationCallOrder[0]!,
    );
  });

  test('a refresh that fails reports why', async () => {
    lib.getTokens.mockRejectedValue(new Error('revoked'));
    await expect(googleAuth.refreshAccessToken('stale')).rejects.toMatchObject({
      kind: 'auth-expired',
    });
  });

  test('tokens never appear in thrown errors', async () => {
    lib.getTokens.mockRejectedValue(new Error('failed for ya29.SECRET-TOKEN'));
    const error = await googleAuth.getAccessToken().catch((e) => e);
    expect(JSON.stringify([error.message, error.kind])).not.toContain('SECRET-TOKEN');
  });
});

describe('signing out and revoking', () => {
  test('call through to Google', async () => {
    await googleAuth.signOut();
    await googleAuth.revokeAccess();
    expect(lib.signOut).toHaveBeenCalled();
    expect(lib.revokeAccess).toHaveBeenCalled();
  });

  test('failures are translated', async () => {
    lib.signOut.mockRejectedValue(new Error('Network error'));
    await expect(googleAuth.signOut()).rejects.toBeInstanceOf(BackupError);
  });
});

describe('translateGoogleError', () => {
  test('leaves BackupErrors alone', () => {
    const error = new BackupError('quota');
    expect(translateGoogleError(error)).toBe(error);
  });

  test('copes with odd values', () => {
    for (const value of [null, undefined, 'text', 42, {}]) {
      expect(translateGoogleError(value).kind).toBe('unknown');
    }
  });
});
