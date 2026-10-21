import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

// The current time, refreshed every second while the screen is open. One timer per screen: lists
// of codes share it by passing `now` down.
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    // Timers pause in the background; show the right code at once when the app returns.
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => {
      clearInterval(timer);
      appState.remove();
    };
  }, [intervalMs]);
  return now;
}
