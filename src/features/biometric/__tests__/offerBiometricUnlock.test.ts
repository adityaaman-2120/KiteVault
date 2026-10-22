import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { DEFAULT_APP_SETTINGS } from '@/features/settings/appSettings';
import { createVault } from '@/vault';
import { deleteJsonFile } from '@/storage/jsonFile';
import { FAST_KDF, resetVaultFiles } from '@/vault/__support__/testUtils';

import { fakeNative } from '../__support__/fakeNativeKeystore';
import { useBiometricOfferStore } from '../biometricOfferStore';
import { offerBiometricUnlock } from '../offerBiometricUnlock';

jest.mock('@/native/keystore/nativeModule', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  native: require('../__support__/fakeNativeKeystore').fakeNative,
}));

const pending = () => useBiometricOfferStore.getState().pending;

beforeEach(async () => {
  resetVaultFiles();
  deleteJsonFile('settings.json');
  fakeNative.reset();
  useSettingsStore.setState(DEFAULT_APP_SETTINGS);
  useBiometricOfferStore.setState({ pending: false });
  await createVault('correct horse battery staple', { kdfParams: FAST_KDF });
});
afterAll(() => {
  resetVaultFiles();
  deleteJsonFile('settings.json');
});

test('asks the home screen for the popup when biometrics are available and still off', async () => {
  await offerBiometricUnlock();
  expect(pending()).toBe(true);
  // It only asks. Nothing is turned on until the person taps Turn on in the popup.
  expect(fakeNative.enableBiometricUnlock).not.toHaveBeenCalled();
});

test('does not ask after "Don\'t ask again"', async () => {
  await useSettingsStore.getState().update({ biometricPromptDismissed: true });
  await offerBiometricUnlock();
  expect(pending()).toBe(false);
});

test.each([
  ['biometrics are not available', () => (fakeNative.available = false)],
  ['it is already on', () => (fakeNative.state = 'ready')],
  ['it needs the master password first', () => (fakeNative.state = 'reauth-required')],
])('does not ask when %s', async (_name, arrange) => {
  arrange();
  await offerBiometricUnlock();
  expect(pending()).toBe(false);
});
