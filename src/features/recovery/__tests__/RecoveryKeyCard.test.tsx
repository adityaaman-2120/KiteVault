import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import {
  createVault,
  generateRecoveryKey,
  getRecoveryInfo,
  setRecoveryKey,
  useVaultStore,
} from '@/vault';
import { FAST_KDF, resetVaultFiles } from '@/vault/__support__/testUtils';

import { RecoveryKeyCard } from '../RecoveryKeyCard';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  // Runs once when the card appears, like the real hook does when the screen is focused.
  useFocusEffect: (callback: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require('react');
    useEffect(callback, [callback]);
  },
}));

let alertSpy: jest.SpyInstance;

beforeEach(async () => {
  jest.clearAllMocks();
  resetVaultFiles();
  const data = await createVault('correct horse battery staple', { kdfParams: FAST_KDF });
  useVaultStore.setState({ data });
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
afterAll(resetVaultFiles);

test('without a recovery key it explains the risk and offers to create one', async () => {
  await render(<RecoveryKeyCard />);
  expect(await screen.findByText('Recovery key')).toBeTruthy();
  expect(screen.getByText(/your data cannot be recovered/i)).toBeTruthy();
  expect(
    screen.getByText('Anyone with the recovery key can open your vault. Keep it offline.'),
  ).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Remove recovery key' })).toBeNull();

  await fireEvent.press(screen.getByRole('button', { name: 'Create recovery key' }));
  expect(mockPush).toHaveBeenCalledWith('/recovery-key');
});

test('with a recovery key it shows when it was made and offers a new one or removal', async () => {
  await setRecoveryKey(generateRecoveryKey(), () => new Date(2026, 9, 22, 12, 0).getTime());
  await render(<RecoveryKeyCard />);
  expect(await screen.findByText(/A recovery key was made on/)).toBeTruthy();
  expect(screen.getByText(/2026/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Make a new recovery key' })).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: 'Make a new recovery key' }));
  expect(mockPush).toHaveBeenCalledWith('/recovery-key');
});

test('removing asks first, then removes it', async () => {
  await setRecoveryKey(generateRecoveryKey());
  await render(<RecoveryKeyCard />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Remove recovery key' }));

  expect(alertSpy).toHaveBeenCalledWith(
    'Remove the recovery key?',
    expect.stringMatching(/stop working/),
    expect.any(Array),
  );
  expect(await getRecoveryInfo()).toMatchObject({ exists: true }); // not yet

  const buttons = alertSpy.mock.calls.at(-1)![2] as AlertButton[];
  buttons.find((b) => b.style === 'destructive')!.onPress?.();
  await waitFor(async () => expect(await getRecoveryInfo()).toEqual({ exists: false }));
  expect(await screen.findByRole('button', { name: 'Create recovery key' })).toBeTruthy();
});

test('cancelling the removal keeps the key', async () => {
  await setRecoveryKey(generateRecoveryKey());
  await render(<RecoveryKeyCard />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Remove recovery key' }));
  const buttons = alertSpy.mock.calls.at(-1)![2] as AlertButton[];
  buttons.find((b) => b.style === 'cancel')!.onPress?.();
  expect(await getRecoveryInfo()).toMatchObject({ exists: true });
});
