import { act, fireEvent, render, screen } from '@testing-library/react-native';
import JailMonkey from 'jail-monkey';

import { detectRootedDevice } from '../rootCheck';
import { ROOT_WARNING, RootWarningBanner } from '../RootWarningBanner';

jest.mock('jail-monkey', () => ({ __esModule: true, default: { isJailBroken: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }),
}));

const isJailBroken = JailMonkey.isJailBroken as jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  isJailBroken.mockReset();
});
afterEach(() => jest.useRealTimers());

async function renderBanner() {
  await render(<RootWarningBanner />);
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
}

describe('detectRootedDevice', () => {
  test('reports what the library says', () => {
    isJailBroken.mockReturnValue(true);
    expect(detectRootedDevice()).toBe(true);
    isJailBroken.mockReturnValue(false);
    expect(detectRootedDevice()).toBe(false);
  });

  test('treats a failing or unlinked library as "no warning"', () => {
    isJailBroken.mockImplementation(() => {
      throw new Error("jail-monkey doesn't seem to be linked");
    });
    expect(detectRootedDevice()).toBe(false);
  });
});

describe('RootWarningBanner', () => {
  test('warns on a rooted device', async () => {
    isJailBroken.mockReturnValue(true);
    await renderBanner();
    expect(screen.getByText(ROOT_WARNING)).toBeTruthy();
  });

  test('shows nothing on a normal device', async () => {
    isJailBroken.mockReturnValue(false);
    await renderBanner();
    expect(screen.queryByText(ROOT_WARNING)).toBeNull();
  });

  test('shows nothing when the check cannot run', async () => {
    isJailBroken.mockImplementation(() => {
      throw new Error('boom');
    });
    await renderBanner();
    expect(screen.queryByText(ROOT_WARNING)).toBeNull();
  });

  test('can be dismissed, and never blocks anything', async () => {
    isJailBroken.mockReturnValue(true);
    await renderBanner();
    await fireEvent.press(screen.getByRole('button', { name: 'Dismiss warning' }));
    expect(screen.queryByText(ROOT_WARNING)).toBeNull();
  });
});
