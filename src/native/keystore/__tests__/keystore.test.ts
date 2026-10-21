// Tests the JavaScript side of the native module wrapper. The Kotlin side is covered by
// BiometricPolicyTest.kt and by trying it on a real device.
type Keystore = typeof import('..');

function load(nativeModule: unknown): Keystore {
  let loaded!: Keystore;
  jest.isolateModules(() => {
    jest.doMock('../nativeModule', () => ({ native: nativeModule }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('..');
  });
  return loaded;
}

const nativeError = (code: string, message = 'native text') =>
  Object.assign(new Error(message), { code });

describe('without the native module (for example unit tests)', () => {
  const keystore = load(null);

  test('reports biometrics as unavailable and never throws', async () => {
    expect(keystore.isBiometricAvailable()).toBe(false);
    expect(await keystore.getUnlockState()).toBe('disabled');
    expect(() => keystore.disableBiometricUnlock()).not.toThrow();
    expect(() => keystore.recordPasswordUnlock()).not.toThrow();
  });

  test('enable and unlock fail with kind "unsupported"', async () => {
    await expect(keystore.enableBiometricUnlock(new Uint8Array(32))).rejects.toMatchObject({
      kind: 'unsupported',
    });
    await expect(keystore.unlockWithBiometrics()).rejects.toMatchObject({ kind: 'unsupported' });
  });
});

describe('error mapping', () => {
  test.each([
    ['ERR_BIOMETRIC_USER_CANCELED', 'cancelled'],
    ['ERR_BIOMETRIC_KEY_INVALIDATED', 'key-invalidated'],
    ['ERR_BIOMETRIC_UNAVAILABLE', 'unavailable'],
    ['ERR_BIOMETRIC_LOCKED_OUT', 'locked-out'],
    ['ERR_BIOMETRIC_NOT_ENABLED', 'not-enabled'],
    ['ERR_BIOMETRIC_BUSY', 'busy'],
    ['ERR_BIOMETRIC_AUTH_FAILED', 'failed'],
    ['SOMETHING_ELSE', 'failed'],
  ])('%s becomes "%s"', async (code, kind) => {
    const keystore = load({ unlockWithBiometrics: async () => Promise.reject(nativeError(code)) });
    await expect(keystore.unlockWithBiometrics()).rejects.toMatchObject({
      name: 'BiometricError',
      kind,
    });
  });

  test.each(['REBOOT', 'EXPIRED', 'USE_LIMIT'])(
    're-authentication reason %s is kept',
    async (reason) => {
      const keystore = load({
        unlockWithBiometrics: async () =>
          Promise.reject(nativeError('ERR_BIOMETRIC_REAUTH_REQUIRED', reason)),
      });
      await expect(keystore.unlockWithBiometrics()).rejects.toMatchObject({
        kind: 'reauth-required',
        reason,
      });
    },
  );

  test('native error text is never copied into the error message', async () => {
    const keystore = load({
      enableBiometricUnlock: async () =>
        Promise.reject(nativeError('ERR_BIOMETRIC_AUTH_FAILED', 'secret-ish detail')),
    });
    const error = await keystore.enableBiometricUnlock(new Uint8Array(32)).catch((e) => e);
    expect(error.message).not.toContain('secret-ish');
  });
});

describe('with the native module', () => {
  test('passes calls through', async () => {
    const key = new Uint8Array([1, 2, 3]);
    const native = {
      isBiometricAvailable: jest.fn(() => true),
      getUnlockState: jest.fn(async () => 'ready'),
      enableBiometricUnlock: jest.fn(async () => {}),
      unlockWithBiometrics: jest.fn(async () => key),
      disableBiometricUnlock: jest.fn(),
      recordPasswordUnlock: jest.fn(),
    };
    const keystore = load(native);

    expect(keystore.isBiometricAvailable()).toBe(true);
    expect(await keystore.getUnlockState()).toBe('ready');
    await keystore.enableBiometricUnlock(key);
    expect(native.enableBiometricUnlock).toHaveBeenCalledWith(key);
    expect(await keystore.unlockWithBiometrics()).toBe(key);
    keystore.disableBiometricUnlock();
    keystore.recordPasswordUnlock();
    expect(native.disableBiometricUnlock).toHaveBeenCalled();
    expect(native.recordPasswordUnlock).toHaveBeenCalled();
  });

  test('a failing state check falls back to "disabled"', async () => {
    const keystore = load({
      getUnlockState: async () => Promise.reject(new Error('boom')),
      isBiometricAvailable: () => {
        throw new Error('boom');
      },
    });
    expect(await keystore.getUnlockState()).toBe('disabled');
    expect(keystore.isBiometricAvailable()).toBe(false);
  });
});
