import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useSessionStore } from '@/features/session/useSessionStore';
import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { onActivity } from '@/utils/activity';
import { useVaultStore } from '@/vault';

import { createAutoLock, type AutoLock } from './autoLock';

// Connects the lock timing rules to AppState, user activity and the vault store.
export function useAutoLock(): void {
  const status = useSessionStore((s) => s.status);
  const autoLock = useRef<AutoLock | null>(null);

  useEffect(() => {
    const controller = createAutoLock({
      lock: () => useVaultStore.getState().lock(),
      // Read at the moment of each event, so a changed setting applies immediately.
      getConfig: () => {
        const { backgroundLockSeconds, inactivityLockMinutes } = useSettingsStore.getState();
        return {
          backgroundTimeoutMs: backgroundLockSeconds * 1000,
          inactivityTimeoutMs: inactivityLockMinutes * 60_000,
        };
      },
    });
    autoLock.current = controller;
    controller.setUnlocked(useSessionStore.getState().status === 'unlocked');

    const appState = AppState.addEventListener('change', controller.appStateChanged);
    const stopActivity = onActivity(controller.activity);
    return () => {
      appState.remove();
      stopActivity();
      controller.dispose();
      autoLock.current = null;
    };
  }, []);

  useEffect(() => {
    autoLock.current?.setUnlocked(status === 'unlocked');
  }, [status]);
}
