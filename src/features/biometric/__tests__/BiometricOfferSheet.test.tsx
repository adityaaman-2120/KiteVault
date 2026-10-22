import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { DEFAULT_APP_SETTINGS } from '@/features/settings/appSettings';
import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { deleteJsonFile } from '@/storage/jsonFile';
import { createVault } from '@/vault';
import { FAST_KDF, resetVaultFiles } from '@/vault/__support__/testUtils';

import { fakeNative } from '../__support__/fakeNativeKeystore';
import { BiometricOfferSheet } from '../BiometricOfferSheet';
import { useBiometricOfferStore } from '../biometricOfferStore';

jest.mock('@/native/keystore/nativeModule', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  native: require('../__support__/fakeNativeKeystore').fakeNative,
}));

const button = (name: string) => screen.getByRole('button', { name });
const offerShown = () => screen.queryByText('Unlock with your fingerprint or face') !== null;

// A freshly created vault: unlocked, with no biometric key yet.
beforeEach(async () => {
  resetVaultFiles();
  fakeNative.reset();
  jest.clearAllMocks();
  await createVault('correct horse battery staple', { kdfParams: FAST_KDF });
  deleteJsonFile('settings.json');
  useSettingsStore.setState(DEFAULT_APP_SETTINGS);
  useBiometricOfferStore.setState({ pending: false });
});
afterAll(() => {
  resetVaultFiles();
  deleteJsonFile('settings.json');
});

describe('the biometric offer after creating the vault', () => {
  test('shows nothing until it is requested, and does not ask the phone about biometrics', async () => {
    await render(<BiometricOfferSheet />);
    expect(offerShown()).toBe(false);
    expect(fakeNative.getUnlockState).not.toHaveBeenCalled();
  });

  test('shows the popup with Turn on and Add later, and the benefits', async () => {
    useBiometricOfferStore.getState().request();
    await render(<BiometricOfferSheet />);

    expect(await screen.findByText('Unlock with your fingerprint or face')).toBeTruthy();
    expect(button('Turn on')).toBeTruthy();
    expect(button('Add later')).toBeTruthy();
    expect(button("Don't ask again")).toBeTruthy();
    expect(screen.getByText('Open KiteVault with one touch')).toBeTruthy();
    expect(screen.getByText(/asks for the master password again after a restart/)).toBeTruthy();
  });

  test('Add later closes it and turns nothing on', async () => {
    useBiometricOfferStore.getState().request();
    await render(<BiometricOfferSheet />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Add later' }));

    expect(offerShown()).toBe(false);
    expect(useBiometricOfferStore.getState().pending).toBe(false);
    expect(fakeNative.enableBiometricUnlock).not.toHaveBeenCalled();
    expect(fakeNative.stored).toBeNull();
  });

  test("Don't ask again closes it, remembers that, and nothing is turned on", async () => {
    useBiometricOfferStore.getState().request();
    await render(<BiometricOfferSheet />);
    await fireEvent.press(await screen.findByRole('button', { name: "Don't ask again" }));

    await waitFor(() => expect(offerShown()).toBe(false));
    expect(useSettingsStore.getState().biometricPromptDismissed).toBe(true);
    expect(useBiometricOfferStore.getState().pending).toBe(false);
    expect(fakeNative.enableBiometricUnlock).not.toHaveBeenCalled();
  });

  test("after Don't ask again the popup does not come back, even if it is requested", async () => {
    await useSettingsStore.getState().update({ biometricPromptDismissed: true });
    useBiometricOfferStore.getState().request();
    await render(<BiometricOfferSheet />);

    await waitFor(() => expect(useBiometricOfferStore.getState().pending).toBe(false));
    expect(offerShown()).toBe(false);
  });

  test('Add later is not remembered, so the popup can come back next time', async () => {
    useBiometricOfferStore.getState().request();
    await render(<BiometricOfferSheet />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Add later' }));

    expect(useSettingsStore.getState().biometricPromptDismissed).toBe(false);
  });

  test('Turn on enables biometric unlock, says so, and Done closes it', async () => {
    useBiometricOfferStore.getState().request();
    await render(<BiometricOfferSheet />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Turn on' }));

    expect(await screen.findByText('Biometric unlock is on')).toBeTruthy();
    expect(fakeNative.enableBiometricUnlock).toHaveBeenCalledTimes(1);
    expect(fakeNative.stored).not.toBeNull();

    await fireEvent.press(button('Done'));
    expect(screen.queryByText('Biometric unlock is on')).toBeNull();
    expect(useBiometricOfferStore.getState().pending).toBe(false);
  });

  test('a cancelled fingerprint prompt explains itself and the choices stay', async () => {
    useBiometricOfferStore.getState().request();
    await render(<BiometricOfferSheet />);
    fakeNative.failNext = { code: 'ERR_BIOMETRIC_USER_CANCELED' };
    await fireEvent.press(await screen.findByRole('button', { name: 'Turn on' }));

    expect(await screen.findByText(/was not turned on/)).toBeTruthy();
    expect(fakeNative.stored).toBeNull();
    expect(button('Turn on')).toBeTruthy(); // can try again
    await fireEvent.press(button('Add later'));
    expect(offerShown()).toBe(false);
  });

  test('on a phone without biometrics the offer never shows and is dropped', async () => {
    fakeNative.available = false;
    useBiometricOfferStore.getState().request();
    await render(<BiometricOfferSheet />);

    await waitFor(() => expect(useBiometricOfferStore.getState().pending).toBe(false));
    expect(offerShown()).toBe(false);
  });

  test('when biometric unlock is already on the offer is dropped', async () => {
    fakeNative.state = 'ready';
    useBiometricOfferStore.getState().request();
    await render(<BiometricOfferSheet />);

    await waitFor(() => expect(useBiometricOfferStore.getState().pending).toBe(false));
    expect(offerShown()).toBe(false);
  });

  test('a second request later shows it again (for example after another new vault)', async () => {
    useBiometricOfferStore.getState().request();
    await render(<BiometricOfferSheet />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Add later' }));
    expect(offerShown()).toBe(false);

    await act(async () => useBiometricOfferStore.getState().request());
    expect(await screen.findByText('Unlock with your fingerprint or face')).toBeTruthy();
  });
});
