import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useSessionStore } from '@/features/session/useSessionStore';
import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { useVaultStore } from '@/vault';

import { createShakeDetector } from './shakeDetector';

const SAMPLE_MS = 60;

type Motion = {
  setUpdateInterval: (ms: number) => void;
  addListener: (l: (m: { x: number; y: number; z: number }) => void) => { remove: () => void };
};

// Loaded only when needed, and only if the app build really has the sensor module: on a build
// made before it was added, importing it would fail and log an error. Shake-to-lock then just does
// nothing until the app is rebuilt. Only the accelerometer is loaded, not the other sensors.
function loadAccelerometer(): Motion | null {
  const modules = (globalThis as { expo?: { modules?: Record<string, unknown> } }).expo?.modules;
  if (!modules?.ExponentAccelerometer) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('expo-sensors/build/Accelerometer') as { default: Motion }).default;
  } catch {
    return null;
  }
}

// Locks the vault when the phone is shaken. The motion sensor is read only while the vault is
// unlocked, the app is on screen and the setting is on, so it costs no battery otherwise.
export function useShakeToLock(): void {
  const unlocked = useSessionStore((s) => s.status === 'unlocked');
  const enabled = useSettingsStore((s) => s.shakeToLock);

  useEffect(() => {
    if (!unlocked || !enabled) return;

    const detector = createShakeDetector(() => useVaultStore.getState().lock());
    let subscription: { remove: () => void } | undefined;

    const stop = () => {
      subscription?.remove();
      subscription = undefined;
    };
    const start = () => {
      stop();
      try {
        const sensor = loadAccelerometer();
        if (!sensor) return;
        sensor.setUpdateInterval(SAMPLE_MS);
        subscription = sensor.addListener(({ x, y, z }) => detector.feed(x, y, z, Date.now()));
      } catch {
        // No motion sensor (or it is not allowed): shake-to-lock simply does nothing.
      }
    };

    // Not 'active' only when the app is known to be out of sight ('unknown' occurs at start-up).
    if (AppState.currentState !== 'background' && AppState.currentState !== 'inactive') start();
    const appState = AppState.addEventListener('change', (state) =>
      state === 'active' ? start() : stop(),
    );
    return () => {
      appState.remove();
      stop();
    };
  }, [unlocked, enabled]);
}
