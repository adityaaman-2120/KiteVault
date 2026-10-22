import { fakeNative } from '@/features/biometric/__support__/fakeNativeKeystore';
import { Directory, File, Paths } from 'expo-file-system';

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

test('erasing the vault also removes an export that was left in the cache', async () => {
  resetVaultFiles();
  fakeNative.reset();
  useVaultStore.setState({
    data: await createVault('correct horse battery staple', { kdfParams: FAST_KDF }),
  });
  const dir = new Directory(Paths.cache, 'kitevault-exports');
  dir.create({ idempotent: true });
  const leftover = new File(dir, 'KiteVault-passwords.csv');
  leftover.create();
  expect(leftover.exists).toBe(true);

  await eraseEverything();

  expect(dir.exists).toBe(false);
});
