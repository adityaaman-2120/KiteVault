import { ROW, swipeTarget } from '../SwipeBetweenTabs';

const W = 400;

describe('swipeTarget (dragging left shows the page on the right)', () => {
  test('from Vault: drag right opens Quick add, drag left opens Generator', () => {
    expect(swipeTarget('vault', 120, 0, 200, W)).toBe('quick-add');
    expect(swipeTarget('vault', -120, 0, 200, W)).toBe('generator');
  });

  test('the pages follow each other in a row, in both directions', () => {
    expect(swipeTarget('quick-add', -120, 0, 200, W)).toBe('vault');
    expect(swipeTarget('generator', 120, 0, 200, W)).toBe('vault');
    expect(swipeTarget('generator', -120, 0, 200, W)).toBe('settings');
    expect(swipeTarget('settings', 120, 0, 200, W)).toBe('generator');
  });

  test('nothing happens past either end', () => {
    expect(swipeTarget('quick-add', 120, 0, 200, W)).toBeNull();
    expect(swipeTarget('settings', -120, 0, 200, W)).toBeNull();
  });

  test('a short, slow drag is ignored, a quick flick is not', () => {
    expect(swipeTarget('vault', -30, -0.1, 200, W)).toBeNull();
    expect(swipeTarget('vault', -30, -0.8, 200, W)).toBe('generator');
  });

  test('swipes that start at the screen edge are left to the Android back gesture', () => {
    expect(swipeTarget('vault', -120, 0, W - 5, W)).toBeNull();
    expect(swipeTarget('vault', 120, 0, 5, W)).toBeNull();
  });

  test('an unknown tab name is ignored', () => {
    expect(swipeTarget('somewhere', -120, 0, 200, W)).toBeNull();
  });
});

describe('the tabs layout matches the swipe order', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs') as typeof import('node:fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('node:path') as typeof import('node:path');
  const layout = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'app', '(tabs)', '_layout.tsx'),
    'utf8',
  );

  test('lists the screens in the same order as the swipe row', () => {
    const names = [...layout.matchAll(/<Tabs\.Screen\s+name="([^"]+)"/g)].map((m) => m[1]);
    expect(names).toEqual(ROW);
  });

  test('opens on Vault, not on the first listed page', () => {
    expect(layout).toMatch(/initialRouteName: 'vault'/);
  });

  test('Quick add takes no room in the tab bar', () => {
    expect(layout).toMatch(/name="quick-add"[\s\S]*?tabBarItemStyle: \{ display: 'none' \}/);
  });

  test('only Vault, Generator and Settings have tab bar buttons', () => {
    expect(layout.match(/tabBarIcon/g)).toHaveLength(3);
  });

  test('never hides a swipe page with href: null (that makes it impossible to open)', () => {
    expect(layout).not.toMatch(/href:\s*null/);
    expect(layout).toMatch(/name="quick-add"[\s\S]*?tabBarButton/);
  });
});
