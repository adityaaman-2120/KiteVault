import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { deleteJsonFile, writeJsonFile } from '@/storage/jsonFile';
import { useVaultStore, VaultError } from '@/vault';

import { UnlockForm, formatWait } from '../UnlockForm';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: jest.fn() }) }));

const unlock = jest.fn();
const field = () => screen.getByLabelText('Master password');
const unlockButton = () => screen.getByRole('button', { name: /^unlock/i });

async function type(password: string) {
  await fireEvent.changeText(field(), password);
}

beforeEach(() => {
  jest.clearAllMocks();
  deleteJsonFile('unlock-attempts.json');
  unlock.mockResolvedValue(undefined);
  useVaultStore.setState({ unlock });
});
afterAll(() => deleteJsonFile('unlock-attempts.json'));

test('the button is disabled until a password is typed', async () => {
  await render(<UnlockForm />);
  expect(unlockButton()).toBeDisabled();
  await type('x');
  expect(unlockButton()).toBeEnabled();
});

test('a correct password opens the vault', async () => {
  await render(<UnlockForm />);
  await type('right');
  await fireEvent.press(unlockButton());
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/vault'));
  expect(unlock).toHaveBeenCalledWith('right');
});

test('shows a loading state while checking, and ignores a second press', async () => {
  let finish!: () => void;
  unlock.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
  await render(<UnlockForm />);
  await type('right');

  void fireEvent.press(unlockButton());
  expect(await screen.findByText('Unlocking…')).toBeTruthy();
  expect(unlockButton()).toBeDisabled();
  expect(field().props.editable).toBe(false);
  await fireEvent.press(unlockButton());
  expect(unlock).toHaveBeenCalledTimes(1);

  finish();
  await waitFor(() => expect(mockReplace).toHaveBeenCalled());
});

test('a wrong password shows an error and clears the field', async () => {
  unlock.mockRejectedValue(new VaultError('WRONG_PASSWORD', 'nope'));
  await render(<UnlockForm />);
  await type('guess');
  await fireEvent.press(unlockButton());

  expect(await screen.findByText('Wrong password. Please try again.')).toBeTruthy();
  expect(field().props.value).toBe('');
  expect(mockReplace).not.toHaveBeenCalled();
});

test('a damaged vault is reported as such, not as a wrong password', async () => {
  unlock.mockRejectedValue(new VaultError('CORRUPTED', 'x'));
  await render(<UnlockForm />);
  await type('guess');
  await fireEvent.press(unlockButton());
  expect(await screen.findByText(/damaged and cannot be opened/i)).toBeTruthy();
});

test('an unexpected error shows a generic message without details', async () => {
  const spies = (['log', 'warn', 'error'] as const).map((m) =>
    jest.spyOn(console, m).mockImplementation(() => {}),
  );
  unlock.mockRejectedValue(new Error('internal detail with guess-123'));
  await render(<UnlockForm />);
  await type('guess-123');
  await fireEvent.press(unlockButton());
  expect(await screen.findByText('Could not unlock the vault. Please try again.')).toBeTruthy();
  expect(screen.queryByText(/guess-123|internal detail/)).toBeNull();
  for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  spies.forEach((spy) => spy.mockRestore());
});

test('after 5 wrong passwords the form shows a delay and blocks further tries', async () => {
  unlock.mockRejectedValue(new VaultError('WRONG_PASSWORD', 'nope'));
  await render(<UnlockForm />);

  for (let i = 0; i < 5; i++) {
    await type('guess');
    await fireEvent.press(unlockButton());
    await screen.findByText('Wrong password. Please try again.');
    await waitFor(() => expect(unlockButton()).toBeDisabled()); // empty field again
  }

  expect(await screen.findByText(/Try again in 0:(30|29)/)).toBeTruthy();
  await type('another guess');
  expect(unlockButton()).toBeDisabled(); // blocked by the delay, not just the empty field
  expect(unlock).toHaveBeenCalledTimes(5);
});

test('a delay that was already running when the app opened is shown', async () => {
  await writeJsonFile('unlock-attempts.json', {
    failedAttempts: 6,
    lastFailedAt: Date.now() - 10_000,
  });
  await render(<UnlockForm />);
  expect(await screen.findByText(/Try again in 0:(49|50)/)).toBeTruthy();
  await type('x');
  expect(unlockButton()).toBeDisabled();
});

test('the countdown ticks down and re-enables the button when it ends', async () => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  try {
    await writeJsonFile('unlock-attempts.json', {
      failedAttempts: 5,
      lastFailedAt: Date.now() - 27_000,
    });
    await render(<UnlockForm />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText(/Try again in 0:03/)).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByText(/Try again in 0:01/)).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.queryByText(/Try again in/)).toBeNull();
    await type('x');
    expect(unlockButton()).toBeEnabled();
  } finally {
    jest.useRealTimers();
  }
});

test('formatWait rounds up to whole seconds', () => {
  expect(formatWait(30_000)).toBe('0:30');
  expect(formatWait(29_001)).toBe('0:30');
  expect(formatWait(61_000)).toBe('1:01');
  expect(formatWait(900_000)).toBe('15:00');
});
