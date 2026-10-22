import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { KiteVaultSplash } from '../KiteVaultSplash';

let mockReduced = false;
// Reanimated's own jest mock needs the native runtime, so this stands in for the few parts the
// splash uses. It does not animate; the tests check what is shown and what a tap does.
jest.mock('react-native-reanimated', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text, View } = require('react-native');
  return {
    __esModule: true,
    default: { View, Text },
    Easing: { bezier: () => 0, inOut: () => 0, out: () => 0, ease: 0 },
    Extrapolation: { CLAMP: 'clamp' },
    interpolate: (value: number) => value,
    useAnimatedStyle: () => ({}),
    useReducedMotion: () => mockReduced,
    useSharedValue: (value: number) => ({ value }),
    withDelay: (_: number, animation: unknown) => animation,
    withRepeat: (animation: unknown) => animation,
    withSequence: (...animations: unknown[]) => animations[animations.length - 1],
    withTiming: (to: number) => to,
  };
});
jest.mock('react-native-worklets', () => ({ scheduleOnRN: (fn: () => void) => fn() }));

const skip = () => screen.getByRole('button', { name: /KiteVault from Kitelux\. Tap to skip\./ });

beforeEach(() => {
  mockReduced = false;
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

describe('KiteVaultSplash', () => {
  test('shows the name and the Kitelux credit, and says it can be skipped', async () => {
    await render(<KiteVaultSplash />);
    expect(skip()).toBeTruthy();
    // The wordmark is one letter per element, so it can animate letter by letter.
    for (const letter of 'KiteVault') {
      expect(screen.getAllByText(letter).length).toBeGreaterThan(0);
    }
    expect(screen.getByText('from')).toBeTruthy();
  });

  test('tapping skips it, and the finish call happens only once', async () => {
    const onFinish = jest.fn();
    await render(<KiteVaultSplash onFinish={onFinish} />);

    await fireEvent.press(skip());
    await fireEvent.press(skip());

    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  test('with "reduce motion" on it shows the finished picture and ends after a moment', async () => {
    mockReduced = true;
    const onFinish = jest.fn();
    await render(<KiteVaultSplash onFinish={onFinish} />);
    expect(onFinish).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(700);
    });

    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  test('works without any callback', async () => {
    await render(<KiteVaultSplash />);
    await fireEvent.press(skip());
    expect(skip()).toBeTruthy();
  });
});
