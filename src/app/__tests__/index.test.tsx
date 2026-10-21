import { render, screen } from '@testing-library/react-native';

import HomeScreen from '../index';

test('renders the app name', async () => {
  await render(<HomeScreen />);
  expect(screen.getByText('KiteVault')).toBeTruthy();
});
