import * as Clipboard from 'expo-clipboard';
import { AppState, ToastAndroid } from 'react-native';

import { DEFAULT_APP_SETTINGS } from '@/features/settings/appSettings';
import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { setSensitiveText } from '@/native/keystore/clipboard';

import { copySecret } from '../clipboardService';

jest.mock('expo-clipboard', () => ({
  getStringAsync: jest.fn(async () => ''),
  setStringAsync: jest.fn(async () => true),
}));
jest.mock('@/native/keystore/clipboard', () => ({ setSensitiveText: jest.fn() }));

const setString = Clipboard.setStringAsync as jest.Mock;
const getString = Clipboard.getStringAsync as jest.Mock;
const sensitive = setSensitiveText as jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  useSettingsStore.setState(DEFAULT_APP_SETTINGS);
  jest.spyOn(ToastAndroid, 'show').mockImplementation(() => {});
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

test('a copied secret goes through the "sensitive" clipboard when the phone supports it', async () => {
  sensitive.mockReturnValue(true);
  await copySecret('hunter2');
  expect(sensitive).toHaveBeenCalledWith('hunter2');
  expect(setString).not.toHaveBeenCalled();
});

test('without the native module the ordinary clipboard is used', async () => {
  sensitive.mockReturnValue(false);
  await copySecret('hunter2');
  expect(setString).toHaveBeenCalledWith('hunter2');
});

test('clearing the clipboard afterwards still works, and is not marked sensitive', async () => {
  sensitive.mockReturnValue(true);
  await copySecret('hunter2');
  getString.mockResolvedValue('hunter2');
  await jest.advanceTimersByTimeAsync(30_000);
  expect(setString).toHaveBeenLastCalledWith('');
  expect(sensitive).toHaveBeenCalledTimes(1);
});
