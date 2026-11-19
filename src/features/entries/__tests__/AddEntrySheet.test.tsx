import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { AddEntrySheet } from '../AddEntrySheet';

describe('AddEntrySheet', () => {
  test('shows the four choices and reports the one picked', async () => {
    const onPick = jest.fn();
    await render(<AddEntrySheet visible onClose={jest.fn()} onPick={onPick} />);
    expect(screen.getByText('Add to your vault')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'New card' }));
    expect(onPick).toHaveBeenCalledWith('card');
  });

  test('is not on screen while closed, appears when opened and leaves after closing', async () => {
    const props = { onClose: jest.fn(), onPick: jest.fn() };
    const view = await render(<AddEntrySheet visible={false} {...props} />);
    expect(screen.queryByText('Add to your vault')).toBeNull();

    await view.rerender(<AddEntrySheet visible {...props} />);
    expect(screen.getByText('Add to your vault')).toBeTruthy();

    // It slides away first, then is removed.
    await view.rerender(<AddEntrySheet visible={false} {...props} />);
    await waitFor(() => expect(screen.queryByText('Add to your vault')).toBeNull(), {
      timeout: 2000,
    });
  });

  test('tapping the dimmed area asks to close', async () => {
    const onClose = jest.fn();
    await render(<AddEntrySheet visible onClose={onClose} onPick={jest.fn()} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
