import { Alert, type AlertButton } from 'react-native';

import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { DEFAULT_APP_SETTINGS } from '@/features/settings/appSettings';
import { createVault } from '@/vault';
import { deleteJsonFile } from '@/storage/jsonFile';
import { FAST_KDF, resetVaultFiles } from '@/vault/__support__/testUtils';

import { fakeNative } from '../__support__/fakeNativeKeystore';
import { offerBiometricUnlock } from '../offerBiometricUnlock';

jest.mock('@/native/keystore/nativeModule', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  native: require('../__support__/fakeNativeKeystore').fakeNative,
}));

let alertSpy: jest.SpyInstance;
// The test "taps" a button by label as soon as the first alert is shown.
function tapOnFirstAlert(label: string) {
  alertSpy.mockImplementationOnce((_title, _message, buttons) => {
    (buttons as AlertButton[]).find((b) => b.text === label)?.onPress?.();
  });
}

beforeEach(async () => {
  resetVaultFiles();
  deleteJsonFile('settings.json');
  fakeNative.reset();
  useSettingsStore.setState(DEFAULT_APP_SETTINGS);
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await createVault('correct horse battery staple', { kdfParams: FAST_KDF });
});
afterEach(() => alertSpy.mockRestore());
afterAll(() => {
  resetVaultFiles();
  deleteJsonFile('settings.json');
});

test('asks once, and turns biometric unlock on when the user agrees', async () => {
  tapOnFirstAlert('Enable');
  await offerBiometricUnlock();
  expect(alertSpy).toHaveBeenCalledTimes(1);
  expect(fakeNative.enableBiometricUnlock).toHaveBeenCalledTimes(1);
  expect(fakeNative.state).toBe('ready');
});

test('"Not now" changes nothing and will ask again next time', async () => {
  tapOnFirstAlert('Not now');
  await offerBiometricUnlock();
  expect(fakeNative.enableBiometricUnlock).not.toHaveBeenCalled();
  expect(useSettingsStore.getState().biometricPromptDismissed).toBe(false);
});

test('"Don\'t ask again" is remembered', async () => {
  tapOnFirstAlert("Don't ask again");
  await offerBiometricUnlock();
  expect(useSettingsStore.getState().biometricPromptDismissed).toBe(true);

  alertSpy.mockClear();
  await offerBiometricUnlock();
  expect(alertSpy).not.toHaveBeenCalled();
});

test.each([
  ['biometrics are not available', () => (fakeNative.available = false)],
  ['it is already on', () => (fakeNative.state = 'ready')],
  ['it needs the master password first', () => (fakeNative.state = 'reauth-required')],
])('does not ask when %s', async (_name, arrange) => {
  arrange();
  await offerBiometricUnlock();
  expect(alertSpy).not.toHaveBeenCalled();
});

test('explains clearly when the user cancels the system prompt', async () => {
  tapOnFirstAlert('Enable');
  fakeNative.failNext = { code: 'ERR_BIOMETRIC_USER_CANCELED' };
  await offerBiometricUnlock();
  expect(alertSpy).toHaveBeenCalledTimes(2);
  expect(alertSpy.mock.calls[1]![1]).toMatch(/not turned on/i);
  expect(fakeNative.stored).toBeNull();
});

test('shows a plain message when enabling fails for another reason', async () => {
  tapOnFirstAlert('Enable');
  fakeNative.failNext = { code: 'ERR_BIOMETRIC_UNAVAILABLE' };
  await offerBiometricUnlock();
  expect(alertSpy.mock.calls[1]![1]).toMatch(/No fingerprint or face is set up/i);
});
