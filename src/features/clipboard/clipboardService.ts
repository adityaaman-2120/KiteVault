import * as Clipboard from 'expo-clipboard';
import { AppState, ToastAndroid } from 'react-native';

import { setSensitiveText } from '@/native/keystore/clipboard';
import { useSettingsStore } from '@/features/settings/useSettingsStore';

import { createClipboardCleaner } from './clipboardCleaner';

const cleaner = createClipboardCleaner({
  read: () => Clipboard.getStringAsync(),
  write: async (text) => {
    // A copied secret is marked "sensitive" so Android 13+ hides it in the clipboard preview.
    // Clearing (an empty text) and phones without the native module use the ordinary clipboard.
    if (text !== '' && setSensitiveText(text)) return;
    await Clipboard.setStringAsync(text);
  },
  isForeground: () => AppState.currentState === 'active',
});

let listening = false;
function ensureForegroundListener() {
  if (listening) return;
  listening = true;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') cleaner.appForegrounded();
  });
}

export function copyMessage(clearSeconds: number): string {
  return clearSeconds > 0
    ? `Copied, clears in ${clearSeconds} s`
    : 'Copied (stays on the clipboard until you copy something else)';
}

// Copies a password or username and schedules the clipboard to be cleared (see settings).
// The value is only held in memory until it is cleared; it is never logged or stored.
//
// Limit: if the app is closed before the timer ends, nothing is left running to clear it.
export async function copySecret(value: string): Promise<void> {
  ensureForegroundListener();
  const seconds = useSettingsStore.getState().clipboardClearSeconds;
  await cleaner.copy(value, seconds > 0 ? seconds * 1000 : null);
  ToastAndroid.show(copyMessage(seconds), ToastAndroid.SHORT);
}
