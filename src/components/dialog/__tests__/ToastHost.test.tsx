import { act, render, screen, waitFor } from '@testing-library/react-native';
import { ToastAndroid } from 'react-native';

import { ToastHost } from '../ToastHost';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

test('while mounted, ToastAndroid.show shows the app toast, and it is restored on unmount', async () => {
  const original = ToastAndroid.show;
  const view = await render(<ToastHost />);
  expect(ToastAndroid.show).not.toBe(original);

  await act(async () => ToastAndroid.show('Copied, clears in 30 s', ToastAndroid.SHORT));
  expect(screen.getByText('Copied, clears in 30 s')).toBeTruthy();

  await view.unmount();
  expect(ToastAndroid.show).toBe(original);
});

test('a newer toast replaces the older one, and the toast goes away by itself', async () => {
  jest.useFakeTimers();
  try {
    await render(<ToastHost />);
    await act(async () => ToastAndroid.show('First', ToastAndroid.SHORT));
    await act(async () => ToastAndroid.show('Second', ToastAndroid.SHORT));
    expect(screen.queryByText('First')).toBeNull();
    expect(screen.getByText('Second')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    await waitFor(() => expect(screen.queryByText('Second')).toBeNull());
  } finally {
    jest.useRealTimers();
  }
});
