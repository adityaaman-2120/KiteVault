import { render } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { getPendingSaveCount } from '@/native/keystore/autofill';

import { usePendingSaveWatcher } from '../usePendingSaveWatcher';

const mockPush = jest.fn();
let mockPath = '/vault';
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  usePathname: () => mockPath,
}));
jest.mock('@/native/keystore/autofill', () => ({ getPendingSaveCount: jest.fn() }));

const count = getPendingSaveCount as jest.Mock;

function Probe({ unlocked }: { unlocked: boolean }) {
  usePendingSaveWatcher(unlocked);
  return null;
}

let listener: (state: string) => void = () => {};
beforeEach(() => {
  jest.clearAllMocks();
  mockPath = '/vault';
  count.mockResolvedValue(0);
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: never) => {
    listener = fn;
    return { remove: jest.fn() };
  }) as never);
});
afterEach(() => jest.restoreAllMocks());

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test('opens the save screen when something is waiting as soon as the vault is unlocked', async () => {
  count.mockResolvedValue(1);
  await render(<Probe unlocked />);
  await flush();
  expect(mockPush).toHaveBeenCalledWith('/autofill-save');
});

test('does nothing while the vault is locked, and asks nothing', async () => {
  count.mockResolvedValue(1);
  await render(<Probe unlocked={false} />);
  await flush();
  expect(count).not.toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();
});

test('does nothing when nothing is waiting', async () => {
  await render(<Probe unlocked />);
  await flush();
  expect(mockPush).not.toHaveBeenCalled();
});

test('looks again when the app comes back to the front', async () => {
  const view = await render(<Probe unlocked />);
  await flush();
  expect(mockPush).not.toHaveBeenCalled();
  count.mockResolvedValue(2); // the user agreed to save something in another app
  listener('background');
  listener('active');
  await flush();
  expect(mockPush).toHaveBeenCalledTimes(1);
  await view.unmount();
});

test('does not open the screen again while it is already open', async () => {
  mockPath = '/autofill-save';
  count.mockResolvedValue(1);
  await render(<Probe unlocked />);
  await flush();
  expect(mockPush).not.toHaveBeenCalled();
});

test('after locking, the check stops', async () => {
  const view = await render(<Probe unlocked />);
  await flush();
  await view.rerender(<Probe unlocked={false} />);
  count.mockResolvedValue(1);
  listener('active');
  await flush();
  expect(mockPush).not.toHaveBeenCalled();
});
