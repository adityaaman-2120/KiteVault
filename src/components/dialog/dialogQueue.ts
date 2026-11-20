import type { AlertButton } from 'react-native';

export type DialogRequest = { title: string; message?: string; buttons: AlertButton[] };

type State = { current: DialogRequest | null; waiting: DialogRequest[] };

let state: State = { current: null, waiting: [] };
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  listeners.forEach((listener) => listener());
}

export const subscribeDialog = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const currentDialog = () => state.current;

// Same shape as Alert.alert. Messages wait their turn if one is already open.
export function showDialog(title: string, message?: string, buttons?: AlertButton[]) {
  const request: DialogRequest = {
    title,
    message,
    buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }],
  };
  if (state.current) set({ ...state, waiting: [...state.waiting, request] });
  else set({ current: request, waiting: [] });
}

// Closes the open message, shows the next one, then runs the pressed button (like the system one).
export function closeDialog(button?: AlertButton) {
  const [next, ...rest] = state.waiting;
  set({ current: next ?? null, waiting: rest });
  button?.onPress?.();
}

// Drops every message without pressing anything. Used when the vault locks, so a message that
// names an entry never stays on screen over the unlock screen.
export function clearDialogs() {
  if (state.current || state.waiting.length > 0) set({ current: null, waiting: [] });
  clearListeners.forEach((listener) => listener());
}

// Told when messages were dropped, so the screen can vanish at once instead of sinking.
const clearListeners = new Set<() => void>();
export const onDialogsCleared = (listener: () => void) => {
  clearListeners.add(listener);
  return () => {
    clearListeners.delete(listener);
  };
};
