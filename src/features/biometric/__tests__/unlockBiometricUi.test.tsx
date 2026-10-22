import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, AppState } from 'react-native';

import { UnlockForm } from '@/features/lock/UnlockForm';
import { clearAttemptState } from '@/features/lock/unlockService';
import { useSessionStore } from '@/features/session/useSessionStore';
import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { DEFAULT_APP_SETTINGS } from '@/features/settings/appSettings';
import { deleteJsonFile } from '@/storage/jsonFile';
import { createVault, getVaultKeyCopy, isVaultUnlocked, useVaultStore } from '@/vault';
import { FAST_KDF, resetVaultFiles } from '@/vault/__support__/testUtils';

import { fakeNative } from '../__support__/fakeNativeKeystore';
import { useBiometricOfferStore } from '../biometricOfferStore';

jest.mock('@/native/keystore/nativeModule', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  native: require('../__support__/fakeNativeKeystore').fakeNative,
}));
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: jest.fn() }) }));

const PASSWORD = 'correct horse battery staple';
const fingerprintButton = () => screen.queryByRole('button', { name: /fingerprint/i });

// A locked vault whose key is also held by the (fake) native module.
async function lockedVaultWithBiometrics(state: 'ready' | 'reauth-required' = 'ready') {
  await createVault(PASSWORD, { kdfParams: FAST_KDF });
  fakeNative.stored = getVaultKeyCopy();
  fakeNative.state = state;
  useVaultStore.getState().lock();
}

beforeEach(() => {
  jest.clearAllMocks();
  resetVaultFiles();
  clearAttemptState();
  deleteJsonFile('settings.json');
  fakeNative.reset();
  useSettingsStore.setState(DEFAULT_APP_SETTINGS);
  useVaultStore.setState({ data: null });
  useSessionStore.getState().setStatus('locked');
  useBiometricOfferStore.setState({ pending: false });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => {
  resetVaultFiles();
  clearAttemptState();
  deleteJsonFile('settings.json');
});

describe('fingerprint button', () => {
  test('is shown when biometric unlock is ready, next to the master password field', async () => {
    await lockedVaultWithBiometrics();
    await render(<UnlockForm />);
    expect(await screen.findByRole('button', { name: /unlock with fingerprint/i })).toBeTruthy();
    expect(screen.getByLabelText('Master password')).toBeTruthy();
  });

  test('is not shown when biometric unlock is off', async () => {
    await createVault(PASSWORD, { kdfParams: FAST_KDF });
    useVaultStore.getState().lock();
    await render(<UnlockForm />);
    await waitFor(() => expect(fakeNative.getUnlockState).toHaveBeenCalled());
    expect(fingerprintButton()).toBeNull();
  });

  test('unlocks the vault and opens it', async () => {
    await lockedVaultWithBiometrics();
    await render(<UnlockForm />);
    await fireEvent.press(await screen.findByRole('button', { name: /unlock with fingerprint/i }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/vault'));
    expect(isVaultUnlocked()).toBe(true);
  });

  test('cancelling shows a clear message and the master password still works', async () => {
    await lockedVaultWithBiometrics();
    await render(<UnlockForm />);
    fakeNative.failNext = { code: 'ERR_BIOMETRIC_USER_CANCELED' };
    await fireEvent.press(await screen.findByRole('button', { name: /unlock with fingerprint/i }));

    expect(await screen.findByText(/cancelled\. You can use your master password/i)).toBeTruthy();
    expect(isVaultUnlocked()).toBe(false);

    await fireEvent.changeText(screen.getByLabelText('Master password'), PASSWORD);
    await fireEvent.press(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/vault'));
    expect(isVaultUnlocked()).toBe(true);
  });

  test('too many wrong fingers shows the lock-out message', async () => {
    await lockedVaultWithBiometrics();
    await render(<UnlockForm />);
    fakeNative.failNext = { code: 'ERR_BIOMETRIC_LOCKED_OUT' };
    await fireEvent.press(await screen.findByRole('button', { name: /unlock with fingerprint/i }));
    expect(await screen.findByText(/Too many failed biometric attempts/i)).toBeTruthy();
  });

  test('when the native side says a restart / 7 days / 5 unlocks passed, the button goes away', async () => {
    await lockedVaultWithBiometrics();
    await render(<UnlockForm />);
    const button = await screen.findByRole('button', { name: /unlock with fingerprint/i });
    fakeNative.failNext = { code: 'ERR_BIOMETRIC_REAUTH_REQUIRED', message: 'USE_LIMIT' };
    fakeNative.state = 'reauth-required';
    await fireEvent.press(button);

    expect(await screen.findByText(/used biometric unlock 5 times/i)).toBeTruthy();
    await waitFor(() => expect(fingerprintButton()).toBeNull());
  });
});

describe('biometrics that cannot be used', () => {
  test('re-authentication needed: no button, and a note says why', async () => {
    await lockedVaultWithBiometrics('reauth-required');
    await render(<UnlockForm />);
    expect(await screen.findByText(/please enter your master password/i)).toBeTruthy();
    expect(fingerprintButton()).toBeNull();
    expect(fakeNative.disableBiometricUnlock).not.toHaveBeenCalled(); // still set up
  });

  test('changed biometrics: the stored key is removed and the user is told', async () => {
    await lockedVaultWithBiometrics();
    fakeNative.state = 'invalidated';
    await render(<UnlockForm />);

    expect(await screen.findByText(/fingerprint or face settings changed/i)).toBeTruthy();
    expect(fakeNative.disableBiometricUnlock).toHaveBeenCalled();
    await waitFor(() => expect(fingerprintButton()).toBeNull());
  });

  test('biometrics removed from the phone: the stored key is removed and the user is told', async () => {
    await lockedVaultWithBiometrics();
    fakeNative.state = 'unavailable';
    await render(<UnlockForm />);

    expect(await screen.findByText(/No fingerprint or face is set up/i)).toBeTruthy();
    expect(fakeNative.disableBiometricUnlock).toHaveBeenCalled();
  });
});

describe('master password unlock', () => {
  test('restarts the biometric counters, and offers biometrics when they are off', async () => {
    await createVault(PASSWORD, { kdfParams: FAST_KDF });
    useVaultStore.getState().lock();
    await render(<UnlockForm />);
    await fireEvent.changeText(screen.getByLabelText('Master password'), PASSWORD);
    await fireEvent.press(screen.getByRole('button', { name: 'Unlock' }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/vault'));
    expect(fakeNative.recordPasswordUnlock).toHaveBeenCalledTimes(1);
    // The popup on the home screen is requested (it is the same one shown after creating a vault).
    await waitFor(() => expect(useBiometricOfferStore.getState().pending).toBe(true));
    expect(Alert.alert).not.toHaveBeenCalled(); // no plain message any more
  });

  test('a wrong password does not restart the counters', async () => {
    await createVault(PASSWORD, { kdfParams: FAST_KDF });
    useVaultStore.getState().lock();
    await render(<UnlockForm />);
    await fireEvent.changeText(screen.getByLabelText('Master password'), 'wrong password');
    await fireEvent.press(screen.getByRole('button', { name: 'Unlock' }));

    expect(await screen.findByText('Wrong password. Please try again.')).toBeTruthy();
    expect(fakeNative.recordPasswordUnlock).not.toHaveBeenCalled();
    expect(useBiometricOfferStore.getState().pending).toBe(false);
  });
});

describe('the fingerprint prompt opens by itself', () => {
  // In these tests the app is in front, as it is when the lock screen appears on a phone.
  const original = Object.getOwnPropertyDescriptor(AppState, 'currentState');
  const setAppState = (value: string) =>
    Object.defineProperty(AppState, 'currentState', { value, configurable: true, writable: true });
  beforeEach(() => setAppState('active'));
  afterEach(() => {
    if (original) Object.defineProperty(AppState, 'currentState', original);
  });

  test('when biometric unlock is ready, with no tap needed', async () => {
    await lockedVaultWithBiometrics();
    await render(<UnlockForm />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/vault'));
    expect(fakeNative.unlockWithBiometrics).toHaveBeenCalledTimes(1);
    expect(isVaultUnlocked()).toBe(true);
  });

  test('not when biometric unlock is off: the password is the way in', async () => {
    await createVault(PASSWORD, { kdfParams: FAST_KDF });
    useVaultStore.getState().lock();
    await render(<UnlockForm />);
    await waitFor(() => expect(fakeNative.getUnlockState).toHaveBeenCalled());

    expect(fakeNative.unlockWithBiometrics).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test('dismissing it says nothing, does not come back, and leaves the password and the button', async () => {
    await lockedVaultWithBiometrics();
    fakeNative.failNext = { code: 'ERR_BIOMETRIC_USER_CANCELED' };
    await render(<UnlockForm />);

    await waitFor(() => expect(fakeNative.unlockWithBiometrics).toHaveBeenCalledTimes(1));
    await screen.findByRole('button', { name: /unlock with fingerprint/i });
    expect(screen.queryByText(/cancelled/i)).toBeNull();
    expect(isVaultUnlocked()).toBe(false);
    expect(fakeNative.unlockWithBiometrics).toHaveBeenCalledTimes(1); // no second prompt

    // The button still works by hand.
    await fireEvent.press(screen.getByRole('button', { name: /unlock with fingerprint/i }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/vault'));
    expect(fakeNative.unlockWithBiometrics).toHaveBeenCalledTimes(2);
  });

  test('other failures are still explained', async () => {
    await lockedVaultWithBiometrics();
    fakeNative.failNext = { code: 'ERR_BIOMETRIC_LOCKED_OUT' };
    await render(<UnlockForm />);

    expect(await screen.findByText(/Too many failed biometric attempts/i)).toBeTruthy();
  });

  test('waits until the app is in front before asking', async () => {
    setAppState('background');
    let notify: (state: string) => void = () => {};
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, l: typeof notify) => {
      notify = l;
      return { remove: jest.fn() };
    }) as never);
    await lockedVaultWithBiometrics();
    await render(<UnlockForm />);
    await screen.findByRole('button', { name: /unlock with fingerprint/i });
    expect(fakeNative.unlockWithBiometrics).not.toHaveBeenCalled();

    await act(async () => notify('active'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/vault'));
    expect(fakeNative.unlockWithBiometrics).toHaveBeenCalledTimes(1);
  });
});
