import { fakeNative } from '@/features/biometric/__support__/fakeNativeKeystore';
import { clearPendingSaves } from '@/native/keystore/autofill';
import { createVault, useVaultStore } from '@/vault';
import { FAST_KDF, resetVaultFiles } from '@/vault/__support__/testUtils';

import { eraseEverything } from '../eraseVault';

jest.mock('@/native/keystore/nativeModule', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  native: require('@/features/biometric/__support__/fakeNativeKeystore').fakeNative,
}));
jest.mock('@/native/keystore/autofill', () => ({ clearPendingSaves: jest.fn(async () => {}) }));

afterAll(() => resetVaultFiles());

test('erasing the vault also deletes logins that were waiting to be saved from autofill', async () => {
  resetVaultFiles();
  fakeNative.reset();
  useVaultStore.setState({
    data: await createVault('correct horse battery staple', { kdfParams: FAST_KDF }),
  });

  await eraseEverything();

  expect(clearPendingSaves).toHaveBeenCalledTimes(1);
});
