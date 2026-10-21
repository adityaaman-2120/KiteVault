import { act, renderHook } from '@testing-library/react-native';
import { allowScreenCaptureAsync, preventScreenCaptureAsync } from 'expo-screen-capture';

import { useSessionStore } from '@/features/session/useSessionStore';
import { DEFAULT_APP_SETTINGS } from '@/features/settings/appSettings';
import { useSettingsStore } from '@/features/settings/useSettingsStore';

import {
  protectScreenCaptureAtStartup,
  shouldBlockScreenCapture,
  useForceScreenProtection,
  useScreenProtection,
} from '../screenProtection';

jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: jest.fn(async () => {}),
  allowScreenCaptureAsync: jest.fn(async () => {}),
}));

const prevent = preventScreenCaptureAsync as jest.Mock;
const allow = allowScreenCaptureAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useSettingsStore.setState(DEFAULT_APP_SETTINGS);
  useSessionStore.getState().setStatus('locked');
});

describe('shouldBlockScreenCapture', () => {
  test.each([
    ['no-vault', false, true],
    ['no-vault', true, true],
    ['locked', false, true],
    ['locked', true, true], // password screens stay protected even if screenshots are allowed
    ['unlocked', false, true],
    ['unlocked', true, false],
  ] as const)('%s with allowScreenshots=%s -> blocked=%s', (status, allowed, blocked) => {
    expect(shouldBlockScreenCapture(status, allowed)).toBe(blocked);
  });

  test('screenshots are blocked by default', () => {
    expect(DEFAULT_APP_SETTINGS.allowScreenshots).toBe(false);
    expect(shouldBlockScreenCapture('unlocked', DEFAULT_APP_SETTINGS.allowScreenshots)).toBe(true);
  });
});

describe('useScreenProtection', () => {
  test('blocks capture while the vault is unlocked by default', async () => {
    useSessionStore.getState().setStatus('unlocked');
    await renderHook(() => useScreenProtection());
    expect(prevent).toHaveBeenCalledWith('kitevault');
    expect(allow).not.toHaveBeenCalled();
  });

  test('allows capture only when unlocked AND the setting is on', async () => {
    useSessionStore.getState().setStatus('unlocked');
    useSettingsStore.setState({ allowScreenshots: true });
    await renderHook(() => useScreenProtection());
    expect(allow).toHaveBeenCalledWith('kitevault');
    expect(prevent).not.toHaveBeenCalled();
  });

  test('follows lock and unlock', async () => {
    useSettingsStore.setState({ allowScreenshots: true });
    useSessionStore.getState().setStatus('unlocked');
    await renderHook(() => useScreenProtection());
    expect(allow).toHaveBeenCalledTimes(1);

    await act(async () => useSessionStore.getState().setStatus('locked'));
    expect(prevent).toHaveBeenCalledTimes(1); // protected again the moment it locks
  });

  test('follows the setting being switched while unlocked', async () => {
    useSessionStore.getState().setStatus('unlocked');
    await renderHook(() => useScreenProtection());
    expect(prevent).toHaveBeenCalledTimes(1);

    await act(async () => useSettingsStore.setState({ allowScreenshots: true }));
    expect(allow).toHaveBeenCalledTimes(1);
    await act(async () => useSettingsStore.setState({ allowScreenshots: false }));
    expect(prevent).toHaveBeenCalledTimes(2);
  });
});

describe('startup protection', () => {
  test('turns protection on immediately', () => {
    protectScreenCaptureAtStartup();
    expect(prevent).toHaveBeenCalledWith('kitevault');
  });

  test('retries when the Android activity is not ready yet', async () => {
    jest.useFakeTimers();
    try {
      prevent.mockRejectedValueOnce(new Error('no activity')).mockRejectedValueOnce(new Error('x'));
      protectScreenCaptureAtStartup();
      await jest.advanceTimersByTimeAsync(1000);
      expect(prevent).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });

  test('a newer request stops an older one from retrying', async () => {
    jest.useFakeTimers();
    try {
      prevent.mockRejectedValue(new Error('no activity'));
      protectScreenCaptureAtStartup();
      await jest.advanceTimersByTimeAsync(10); // first attempt failed, waiting to retry
      prevent.mockResolvedValue(undefined);
      useSessionStore.getState().setStatus('unlocked');
      useSettingsStore.setState({ allowScreenshots: true });
      await renderHook(() => useScreenProtection()); // newest request: allow
      await jest.advanceTimersByTimeAsync(2000);
      expect(allow).toHaveBeenCalled();
      expect(prevent).toHaveBeenCalledTimes(1); // the old request never retried
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('forced protection (recovery key screens)', () => {
  test('blocks capture even when screenshots are allowed and the vault is unlocked', () => {
    expect(shouldBlockScreenCapture('unlocked', true, true)).toBe(true);
    expect(shouldBlockScreenCapture('unlocked', true, false)).toBe(false);
    expect(shouldBlockScreenCapture('unlocked', true)).toBe(false);
  });

  test('the hook keeps capture blocked while such a screen is open, then follows the setting again', async () => {
    useSessionStore.getState().setStatus('unlocked');
    useSettingsStore.setState({ allowScreenshots: true });
    await renderHook(() => useScreenProtection());
    expect(allow).toHaveBeenCalledTimes(1);

    const forced = await renderHook(() => useForceScreenProtection());
    expect(prevent).toHaveBeenCalledTimes(1);

    await forced.unmount();
    expect(allow).toHaveBeenCalledTimes(2);
  });

  test('two such screens at once keep it blocked until both are gone', async () => {
    useSessionStore.getState().setStatus('unlocked');
    useSettingsStore.setState({ allowScreenshots: true });
    await renderHook(() => useScreenProtection());
    const a = await renderHook(() => useForceScreenProtection());
    const b = await renderHook(() => useForceScreenProtection());
    await a.unmount();
    expect(allow).toHaveBeenCalledTimes(1); // still blocked: nothing new allowed
    await b.unmount();
    expect(allow).toHaveBeenCalledTimes(2);
  });
});
