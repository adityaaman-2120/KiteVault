import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { AppState, ToastAndroid } from 'react-native';

import { DEFAULT_APP_SETTINGS } from '@/features/settings/appSettings';
import { useSettingsStore } from '@/features/settings/useSettingsStore';

import { copyMessage, copySecret } from '../clipboardService';
import { CopyButton } from '../CopyButton';

jest.mock('expo-clipboard', () => ({
  getStringAsync: jest.fn(async () => ''),
  setStringAsync: jest.fn(async () => true),
}));

const setString = Clipboard.setStringAsync as jest.Mock;
const getString = Clipboard.getStringAsync as jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  useSettingsStore.setState(DEFAULT_APP_SETTINGS);
  jest.spyOn(ToastAndroid, 'show').mockImplementation(() => {});
  // The Jest mock of AppState exposes currentState as a function; the real one is a string.
  Object.defineProperty(AppState, 'currentState', {
    value: 'active',
    configurable: true,
    writable: true,
  });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('toast text follows the configured delay', () => {
  expect(copyMessage(30)).toBe('Copied, clears in 30 s');
  expect(copyMessage(15)).toBe('Copied, clears in 15 s');
  expect(copyMessage(60)).toBe('Copied, clears in 60 s');
  expect(copyMessage(0)).toMatch(/stays on the clipboard/);
});

test('copies, shows the toast, and clears after 30 s if still ours', async () => {
  await copySecret('hunter2');
  expect(setString).toHaveBeenCalledWith('hunter2');
  expect(ToastAndroid.show).toHaveBeenCalledWith('Copied, clears in 30 s', ToastAndroid.SHORT);

  getString.mockResolvedValue('hunter2');
  await jest.advanceTimersByTimeAsync(30_000);
  expect(setString).toHaveBeenLastCalledWith('');
});

test('does not clear if the clipboard now holds something else', async () => {
  await copySecret('hunter2');
  getString.mockResolvedValue('something else');
  await jest.advanceTimersByTimeAsync(30_000);
  expect(setString).toHaveBeenCalledTimes(1);
});

test('uses the delay from settings', async () => {
  useSettingsStore.setState({ clipboardClearSeconds: 15 });
  await copySecret('hunter2');
  expect(ToastAndroid.show).toHaveBeenCalledWith('Copied, clears in 15 s', ToastAndroid.SHORT);

  getString.mockResolvedValue('hunter2');
  await jest.advanceTimersByTimeAsync(14_999);
  expect(setString).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(1);
  expect(setString).toHaveBeenLastCalledWith('');
});

test('"never" copies without scheduling a clear', async () => {
  useSettingsStore.setState({ clipboardClearSeconds: 0 });
  await copySecret('hunter2');
  getString.mockResolvedValue('hunter2');
  await jest.advanceTimersByTimeAsync(10 * 60_000);
  expect(setString).toHaveBeenCalledTimes(1);
});

test('the secret is never logged', async () => {
  const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((m) =>
    jest.spyOn(console, m).mockImplementation(() => {}),
  );
  await copySecret('hunter2-secret');
  getString.mockResolvedValue('hunter2-secret');
  await jest.advanceTimersByTimeAsync(30_000);
  for (const spy of spies) expect(spy).not.toHaveBeenCalled();
});

test('CopyButton reads the value only when pressed', async () => {
  const getValue = jest.fn(() => 'the-password');
  await render(<CopyButton title="Copy password" getValue={getValue} />);
  expect(getValue).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByRole('button', { name: 'Copy password' }));
  expect(getValue).toHaveBeenCalledTimes(1);
  expect(setString).toHaveBeenCalledWith('the-password');
});
