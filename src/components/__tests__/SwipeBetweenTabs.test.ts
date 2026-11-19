import { swipeTarget } from '../SwipeBetweenTabs';

const W = 400;

describe('swipeTarget', () => {
  test('swiping left goes to the next tab, right goes back', () => {
    expect(swipeTarget('vault', -120, 0, 200, W)).toBe('generator');
    expect(swipeTarget('generator', -120, 0, 200, W)).toBe('settings');
    expect(swipeTarget('settings', 120, 0, 200, W)).toBe('generator');
    expect(swipeTarget('generator', 120, 0, 200, W)).toBe('vault');
  });

  test('does nothing at either end', () => {
    expect(swipeTarget('vault', 120, 0, 200, W)).toBeNull();
    expect(swipeTarget('settings', -120, 0, 200, W)).toBeNull();
  });

  test('a short, slow drag is ignored, a quick flick is not', () => {
    expect(swipeTarget('vault', -30, -0.1, 200, W)).toBeNull();
    expect(swipeTarget('vault', -30, -0.8, 200, W)).toBe('generator');
  });

  test('swipes that start at the screen edge are left to the Android back gesture', () => {
    expect(swipeTarget('generator', 120, 0, 5, W)).toBeNull();
    expect(swipeTarget('generator', -120, 0, W - 5, W)).toBeNull();
  });

  test('an unknown tab name is ignored', () => {
    expect(swipeTarget('somewhere', -120, 0, 200, W)).toBeNull();
  });
});
