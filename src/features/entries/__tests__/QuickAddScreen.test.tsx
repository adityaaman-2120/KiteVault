import { fireEvent, render, screen } from '@testing-library/react-native';

import { QuickAddScreen } from '../QuickAddScreen';

const mockPush = jest.fn();
const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    navigate: mockNavigate,
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useFocusEffect: (effect: () => void) => {
    // Run once like a focused screen would.
    const { useEffect } = jest.requireActual('react');
    useEffect(effect, []); // eslint-disable-line react-hooks/exhaustive-deps
  },
}));

beforeEach(() => jest.clearAllMocks());

describe('QuickAddScreen', () => {
  test('has a shortcut for every kind of entry, each opening the new-entry form', async () => {
    await render(<QuickAddScreen />);
    const expected: [string, string][] = [
      ['New login', 'login'],
      ['New secure note', 'note'],
      ['New card', 'card'],
      ['New identity', 'identity'],
    ];
    for (const [name, type] of expected) {
      await fireEvent.press(screen.getByRole('button', { name }));
      expect(mockPush).toHaveBeenLastCalledWith(`/entry/new?type=${type}`);
    }
  });

  test('also offers import and the generator', async () => {
    await render(<QuickAddScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Import passwords' }));
    expect(mockPush).toHaveBeenCalledWith('/import');
    await fireEvent.press(screen.getByRole('button', { name: 'Make a strong password' }));
    expect(mockNavigate).toHaveBeenCalledWith('/generator');
  });
});
