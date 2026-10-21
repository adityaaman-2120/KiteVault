import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createVault, useVaultStore } from '@/vault';
import { FAST_KDF, resetVaultFiles } from '@/vault/__support__/testUtils';

import { fakeNative } from '../__support__/fakeNativeKeystore';
import { BiometricSettingsCard } from '../BiometricSettingsCard';

jest.mock('@/native/keystore/nativeModule', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  native: require('../__support__/fakeNativeKeystore').fakeNative,
}));

beforeEach(async () => {
  resetVaultFiles();
  fakeNative.reset();
  useVaultStore.setState({ data: null });
  await createVault('correct horse battery staple', { kdfParams: FAST_KDF });
});
afterAll(resetVaultFiles);

test('says so when this phone has no strong biometrics set up', async () => {
  fakeNative.available = false;
  await render(<BiometricSettingsCard />);
  expect(await screen.findByText(/Not available/i)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Turn on' })).toBeNull();
});

test('turns biometric unlock on and then off', async () => {
  await render(<BiometricSettingsCard />);

  await fireEvent.press(await screen.findByRole('button', { name: 'Turn on' }));
  expect(await screen.findByRole('button', { name: 'Turn off' })).toBeTruthy();
  expect(fakeNative.enableBiometricUnlock).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/after 7 days, or after 5 biometric unlocks/i)).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: 'Turn off' }));
  expect(await screen.findByRole('button', { name: 'Turn on' })).toBeTruthy();
  expect(fakeNative.disableBiometricUnlock).toHaveBeenCalled();
  expect(fakeNative.stored).toBeNull();
});

test('a cancelled prompt leaves it off and says why', async () => {
  fakeNative.failNext = { code: 'ERR_BIOMETRIC_USER_CANCELED' };
  await render(<BiometricSettingsCard />);

  await fireEvent.press(await screen.findByRole('button', { name: 'Turn on' }));

  expect(await screen.findByText(/cancelled/i)).toBeTruthy();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Turn on' })).toBeTruthy());
});
