import { render, screen } from '@testing-library/react-native';

import { CardPreview, maskedCardNumber } from '../CardPreview';

describe('maskedCardNumber', () => {
  test('shows only the last four digits', () => {
    expect(maskedCardNumber('4242 4242 4242 4242')).toBe('•••• •••• •••• 4242');
    expect(maskedCardNumber('378282246310005')).toBe('•••• •••• •••• 0005');
    expect(maskedCardNumber('4242424242424242123')).not.toContain('2424');
  });

  test('a short or empty number reveals nothing', () => {
    expect(maskedCardNumber('')).toBe('•••• •••• •••• ••••');
    expect(maskedCardNumber('12')).toBe('•••• •••• •••• ••••');
  });
});

test('the preview is decoration: hidden from screen readers and without the full number', async () => {
  await render(<CardPreview holder="A Person" number="4242424242424242" expiry="09/28" />);
  expect(screen.queryByTestId('card-preview')).toBeNull(); // not found without includeHidden
  expect(screen.queryByText(/4242424242424242/, { includeHiddenElements: true })).toBeNull();
});
