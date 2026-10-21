import { fireEvent, render, screen } from '@testing-library/react-native';

import { SLIDES, WelcomeSlides } from '../WelcomeSlides';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }));

beforeEach(() => jest.clearAllMocks());

test('shows the three slides', async () => {
  await render(<WelcomeSlides />);
  expect(SLIDES).toHaveLength(3);
  for (const slide of SLIDES) expect(screen.getByText(slide.title)).toBeTruthy();
  expect(screen.getByText(/cannot be recovered by anyone/i)).toBeTruthy();
});

test('Next walks through the slides, and the last step opens create-vault', async () => {
  await render(<WelcomeSlides />);
  expect(screen.queryByText('Create your vault')).toBeNull();

  await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  expect(mockPush).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByRole('button', { name: 'Create your vault' }));
  expect(mockPush).toHaveBeenCalledWith('/create-vault');
});
