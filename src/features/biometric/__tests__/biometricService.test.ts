import { BiometricError } from '@/native/keystore';
import {
  createVault,
  getVaultKeyCopy,
  isVaultUnlocked,
  lockVault,
  saveVault,
  unlockVaultWithKey,
  useVaultStore,
} from '@/vault';
import {
  FAST_KDF,
  makeEntry,
  resetVaultFiles,
  snapshot,
  withEntries,
} from '@/vault/__support__/testUtils';
import { useSessionStore } from '@/features/session/useSessionStore';

import { fakeNative } from '../__support__/fakeNativeKeystore';
import { enableBiometric, unlockWithBiometric } from '../biometricService';

jest.mock('@/native/keystore/nativeModule', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  native: require('../__support__/fakeNativeKeystore').fakeNative,
}));

const PASSWORD = 'correct horse battery staple';

async function vaultWithEntry() {
  const created = await createVault(PASSWORD, { kdfParams: FAST_KDF });
  const data = withEntries(created, makeEntry());
  await saveVault(snapshot(data));
  return snapshot(data);
}

beforeEach(() => {
  resetVaultFiles();
  fakeNative.reset();
  useVaultStore.setState({ data: null });
  useSessionStore.getState().setStatus('locked');
});
afterAll(resetVaultFiles);

describe('enableBiometric', () => {
  test('hands the vault key to the native module and wipes the JS copy afterwards', async () => {
    const saved = await vaultWithEntry();
    const sessionKey = getVaultKeyCopy();

    await enableBiometric();

    const handedOver = fakeNative.enableBiometricUnlock.mock.calls[0]![0];
    expect(fakeNative.stored).toEqual(sessionKey); // the right key was stored
    expect(handedOver.every((byte) => byte === 0)).toBe(true); // our copy was zeroed
    // The vault itself still works: the session key was not the thing we wiped.
    await expect(saveVault(snapshot(saved))).resolves.toBeUndefined();
  });

  test('still wipes the copy when the user cancels', async () => {
    await vaultWithEntry();
    fakeNative.failNext = { code: 'ERR_BIOMETRIC_USER_CANCELED' };

    await expect(enableBiometric()).rejects.toMatchObject({ kind: 'cancelled' });

    const handedOver = fakeNative.enableBiometricUnlock.mock.calls[0]![0];
    expect(handedOver.every((byte) => byte === 0)).toBe(true);
    expect(fakeNative.stored).toBeNull();
  });

  test('needs an unlocked vault', async () => {
    await vaultWithEntry();
    lockVault();
    await expect(enableBiometric()).rejects.toMatchObject({ code: 'LOCKED' });
    expect(fakeNative.enableBiometricUnlock).not.toHaveBeenCalled();
  });
});

describe('unlockWithBiometric', () => {
  test('opens the locked vault with the stored key', async () => {
    const saved = await vaultWithEntry();
    await enableBiometric();
    useVaultStore.getState().lock();
    expect(isVaultUnlocked()).toBe(false);

    await unlockWithBiometric();

    expect(isVaultUnlocked()).toBe(true);
    expect(useSessionStore.getState().status).toBe('unlocked');
    expect(snapshot(useVaultStore.getState().data)).toEqual(saved);
  });

  test('a cancelled prompt leaves the vault locked', async () => {
    await vaultWithEntry();
    await enableBiometric();
    useVaultStore.getState().lock();
    fakeNative.failNext = { code: 'ERR_BIOMETRIC_USER_CANCELED' };

    await expect(unlockWithBiometric()).rejects.toMatchObject({ kind: 'cancelled' });

    expect(isVaultUnlocked()).toBe(false);
    expect(useVaultStore.getState().data).toBeNull();
    expect(useSessionStore.getState().status).toBe('locked');
  });

  test.each([
    ['ERR_BIOMETRIC_KEY_INVALIDATED', 'key-invalidated'],
    ['ERR_BIOMETRIC_UNAVAILABLE', 'unavailable'],
    ['ERR_BIOMETRIC_LOCKED_OUT', 'locked-out'],
    ['ERR_BIOMETRIC_REAUTH_REQUIRED', 'reauth-required'],
  ])('%s keeps the vault locked and reports "%s"', async (code, kind) => {
    await vaultWithEntry();
    await enableBiometric();
    useVaultStore.getState().lock();
    fakeNative.failNext = { code };

    await expect(unlockWithBiometric()).rejects.toMatchObject({ kind });
    expect(isVaultUnlocked()).toBe(false);
  });

  test('a stored key that does not match the vault is removed and refused', async () => {
    await vaultWithEntry();
    fakeNative.stored = new Uint8Array(32).fill(9); // some other key
    fakeNative.state = 'ready';
    useVaultStore.getState().lock();

    const error = await unlockWithBiometric().catch((e) => e);

    expect(error).toBeInstanceOf(BiometricError);
    expect(error.kind).toBe('key-invalidated');
    expect(fakeNative.disableBiometricUnlock).toHaveBeenCalled();
    expect(isVaultUnlocked()).toBe(false);
  });
});

describe('vault key handling', () => {
  test('a normal password change keeps biometric unlock working (the vault key is unchanged)', async () => {
    await vaultWithEntry();
    await enableBiometric();

    await useVaultStore.getState().changePassword(PASSWORD, 'a different long password');

    expect(fakeNative.disableBiometricUnlock).not.toHaveBeenCalled();
    useVaultStore.getState().lock();
    await unlockWithBiometric();
    expect(isVaultUnlocked()).toBe(true);
  });

  test('replacing the vault key turns biometric unlock off (the stored key is stale)', async () => {
    await vaultWithEntry();
    await enableBiometric();
    const oldKey = fakeNative.stored!.slice();

    await useVaultStore
      .getState()
      .changePassword(PASSWORD, 'a different long password', { rotateVaultKey: true });

    expect(fakeNative.disableBiometricUnlock).toHaveBeenCalled();
    expect(fakeNative.stored).toBeNull();
    // And the old key really would not open the vault any more.
    lockVault();
    await expect(unlockVaultWithKey(oldKey)).rejects.toMatchObject({ code: 'WRONG_KEY' });
  });
});
