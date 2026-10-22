import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { getPendingSaveCount } from '@/native/keystore/autofill';

export const PENDING_SAVE_ROUTE = '/autofill-save';

// While the vault is unlocked, opens the "Save to KiteVault?" screen when a login is waiting to be
// saved: right after the user unlocks, and whenever the app comes back to the front (for example
// after they agreed to save in another app). It only asks HOW MANY are waiting; the passwords are
// read by the screen itself. Locked or erased: it does nothing, so a waiting login simply waits
// (up to 10 minutes) until the user has unlocked the app.
export function usePendingSaveWatcher(unlocked: boolean): void {
  const router = useRouter();
  const pathname = usePathname();
  const onSaveScreen = useRef(false);
  useEffect(() => {
    onSaveScreen.current = pathname === PENDING_SAVE_ROUTE;
  }, [pathname]);

  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    const check = () => {
      getPendingSaveCount().then((count) => {
        if (!cancelled && count > 0 && !onSaveScreen.current) router.push(PENDING_SAVE_ROUTE);
      });
    };
    check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [unlocked, router]);
}
