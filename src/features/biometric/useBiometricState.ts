import { useCallback, useEffect, useState } from 'react';

import { getUnlockState, isBiometricAvailable, type UnlockState } from '@/native/keystore';

export type BiometricStatus = {
  loaded: boolean;
  available: boolean;
  state: UnlockState;
};

async function readStatus(): Promise<BiometricStatus> {
  const state = await getUnlockState();
  return { loaded: true, available: isBiometricAvailable(), state };
}

// Reads the current biometric setup from the native module. Never shows a dialog.
export function useBiometricState(): BiometricStatus & { refresh: () => Promise<void> } {
  const [status, setStatus] = useState<BiometricStatus>({
    loaded: false,
    available: false,
    state: 'disabled',
  });

  const refresh = useCallback(async () => {
    setStatus(await readStatus());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void readStatus().then((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { ...status, refresh };
}
