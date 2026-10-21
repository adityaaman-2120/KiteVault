import { fireEvent, render, screen } from '@testing-library/react-native';

import { UnlockForm } from '../UnlockForm';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

beforeEach(() => jest.clearAllMocks());

test('the unlock screen has a "Forgot master password?" link that opens recovery', async () => {
  await render(<UnlockForm />);
  const link = screen.getByRole('button', { name: 'Forgot master password?' });
  await fireEvent.press(link);
  expect(mockPush).toHaveBeenCalledWith('/recover');
});

test('the unlock button and the link are separate: pressing the link does not try a password', async () => {
  await render(<UnlockForm />);
  await fireEvent.changeText(screen.getByLabelText('Master password'), 'whatever');
  await fireEvent.press(screen.getByRole('button', { name: 'Forgot master password?' }));
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Wrong password. Please try again.')).toBeNull();
});
