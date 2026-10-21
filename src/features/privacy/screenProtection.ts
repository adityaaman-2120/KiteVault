import { allowScreenCaptureAsync, preventScreenCaptureAsync } from 'expo-screen-capture';
import { useEffect } from 'react';
import { create } from 'zustand';

import { useSessionStore, type VaultStatus } from '@/features/session/useSessionStore';
import { useSettingsStore } from '@/features/settings/useSettingsStore';

// One key for the whole app, so allow/prevent calls cancel each other cleanly.
const CAPTURE_KEY = 'kitevault';
const RETRIES = 8;
const RETRY_DELAY_MS = 250;

// Screens that ask for the master password (create / unlock) are always protected, because a
// screenshot could show a password revealed with "Show". The unlocked vault follows the setting,
// except while a screen shows a recovery key: that is protected whatever the setting says.
export function shouldBlockScreenCapture(
  status: VaultStatus,
  allowScreenshots: boolean,
  forced = false,
): boolean {
  return forced || status !== 'unlocked' || !allowScreenshots;
}

// How many screens currently demand protection (for example the recovery key screen).
const useForcedProtection = create<{ count: number }>(() => ({ count: 0 }));

// Call from a screen that shows something that must never be captured. Protection stays on for
// as long as the screen is mounted, even if "Allow screenshots" is switched on.
export function useForceScreenProtection(): void {
  useEffect(() => {
    useForcedProtection.setState((s) => ({ count: s.count + 1 }));
    return () => useForcedProtection.setState((s) => ({ count: Math.max(0, s.count - 1) }));
  }, []);
}

// Only the most recent request is allowed to keep retrying.
let latestRequest = 0;

async function apply(block: boolean): Promise<void> {
  const mine = ++latestRequest;
  for (let attempt = 0; attempt < RETRIES && mine === latestRequest; attempt++) {
    try {
      if (block) await preventScreenCaptureAsync(CAPTURE_KEY);
      else await allowScreenCaptureAsync(CAPTURE_KEY);
      return;
    } catch {
      // The Android activity may not be attached yet at startup: try again shortly.
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

// Protected from the very first moment of startup; the hook below then follows the state.
export function protectScreenCaptureAtStartup(): void {
  void apply(true);
}

// Sets Android's FLAG_SECURE: blocks screenshots and screen recording and blanks the
// recent-apps preview.
export function useScreenProtection(): void {
  const status = useSessionStore((s) => s.status);
  const allowScreenshots = useSettingsStore((s) => s.allowScreenshots);
  const forced = useForcedProtection((s) => s.count > 0);

  useEffect(() => {
    void apply(shouldBlockScreenCapture(status, allowScreenshots, forced));
  }, [status, allowScreenshots, forced]);
}
