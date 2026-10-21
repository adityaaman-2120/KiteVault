import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { TextField } from '@/components';
import { useSessionStore } from '@/features/session/useSessionStore';
import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { onActivity } from '@/utils/activity';
import { createVault, isVaultUnlocked, lockVault, saveVault, useVaultStore } from '@/vault';
import { FAST_KDF, makeEntry, resetVaultFiles, withEntries } from '@/vault/__support__/testUtils';

import { LockButton } from '../LockButton';
import { useAutoLock } from '../useAutoLock';

type Listener = (state: string) => void;
let appStateListener: Listener = () => {};
const removeListener = jest.fn();

async function unlockedVault() {
  const data = await createVault('correct horse battery staple', { kdfParams: FAST_KDF });
  const withEntry = withEntries(data, makeEntry());
  await saveVault(withEntry); // the vault session now holds this object
  useVaultStore.setState({ data: withEntry });
  useSessionStore.getState().setStatus('unlocked');
  return withEntry;
}

beforeEach(() => {
  resetVaultFiles();
  useVaultStore.setState({ data: null });
  useSessionStore.getState().setStatus('locked');
  useSettingsStore.setState({ backgroundLockSeconds: 0, inactivityLockMinutes: 5 });
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, listener: Listener) => {
    appStateListener = listener;
    return { remove: removeListener };
  }) as never);
});
afterEach(() => jest.restoreAllMocks());
afterAll(resetVaultFiles);

describe('locking wipes decrypted data', () => {
  test('LockButton clears the store, the vault session and the status', async () => {
    const data = await unlockedVault();
    await render(<LockButton />);

    await fireEvent.press(screen.getByLabelText('Lock now'));

    expect(useVaultStore.getState().data).toBeNull();
    expect(isVaultUnlocked()).toBe(false);
    expect(useSessionStore.getState().status).toBe('locked');
    expect(data.entries).toEqual([]); // the in-memory copy was scrubbed too
  });

  test('going to the background with "immediately" locks and wipes the store', async () => {
    await unlockedVault();
    await renderHook(() => useAutoLock());

    await act(async () => appStateListener('background'));

    expect(useVaultStore.getState().data).toBeNull();
    expect(isVaultUnlocked()).toBe(false);
    expect(useSessionStore.getState().status).toBe('locked');
  });

  test('a longer background timeout keeps the vault open for a short absence', async () => {
    useSettingsStore.setState({ backgroundLockSeconds: 300 });
    await unlockedVault();
    await renderHook(() => useAutoLock());

    await act(async () => appStateListener('background'));
    await act(async () => appStateListener('active'));

    expect(useVaultStore.getState().data).not.toBeNull();
    expect(useSessionStore.getState().status).toBe('unlocked');
  });

  test('a setting changed while open applies to the next background event', async () => {
    useSettingsStore.setState({ backgroundLockSeconds: 300 });
    await unlockedVault();
    await renderHook(() => useAutoLock());

    useSettingsStore.setState({ backgroundLockSeconds: 0 });
    await act(async () => appStateListener('background'));

    expect(useSessionStore.getState().status).toBe('locked');
  });

  test('the vault is only auto-locked when it was unlocked', async () => {
    const original = useVaultStore.getState().lock;
    const lockSpy = jest.fn();
    useVaultStore.setState({ lock: lockSpy });
    await renderHook(() => useAutoLock());
    await act(async () => appStateListener('background'));
    useVaultStore.setState({ lock: original });
    expect(lockSpy).not.toHaveBeenCalled();
  });

  test('the listener is removed when the hook unmounts', async () => {
    const { unmount } = await renderHook(() => useAutoLock());
    await unmount();
    expect(removeListener).toHaveBeenCalled();
  });
});

describe('inactivity signal', () => {
  test('typing in a field reports activity', async () => {
    const seen = jest.fn();
    const stop = onActivity(seen);
    await render(<TextField label="Title" />);
    await fireEvent.changeText(screen.getByLabelText('Title'), 'a');
    stop();
    expect(seen).toHaveBeenCalledTimes(1);
  });

  test('typing still reaches the field’s own handler', async () => {
    const onChangeText = jest.fn();
    await render(<TextField label="Title" onChangeText={onChangeText} />);
    await fireEvent.changeText(screen.getByLabelText('Title'), 'hello');
    expect(onChangeText).toHaveBeenCalledWith('hello');
  });
});

test('closing the app locks: a fresh launch starts locked with nothing in memory', async () => {
  await unlockedVault();
  lockVault(); // process death loses all memory; the file remains
  useVaultStore.setState({ data: null });
  useSessionStore.getState().setStatus('no-vault');

  await useVaultStore.getState().initialize();

  expect(useSessionStore.getState().status).toBe('locked');
  expect(useVaultStore.getState().data).toBeNull();
});
