import { fireEvent, render, screen } from '@testing-library/react-native';
import Constants from 'expo-constants';

import { WelcomeSlides } from '../WelcomeSlides';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { cloudBackup: { enabled: true, webClientId: '' } } } },
}));

const config = () =>
  (Constants.expoConfig as unknown as { extra: { cloudBackup: { enabled: boolean } } }).extra
    .cloudBackup;

beforeEach(() => jest.clearAllMocks());

test('offers "Restore from Google Drive" on the welcome screen and opens the restore screen', async () => {
  await render(<WelcomeSlides />);
  await fireEvent.press(screen.getByRole('button', { name: 'Restore from Google Drive' }));
  expect(mockPush).toHaveBeenCalledWith('/restore');
});

test('the button is there from the first slide, next to "Next"', async () => {
  await render(<WelcomeSlides />);
  expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Restore from Google Drive' })).toBeTruthy();
});

test('it is not shown in a build without cloud backup', async () => {
  config().enabled = false;
  try {
    await render(<WelcomeSlides />);
    expect(screen.queryByRole('button', { name: 'Restore from Google Drive' })).toBeNull();
  } finally {
    config().enabled = true;
  }
});
