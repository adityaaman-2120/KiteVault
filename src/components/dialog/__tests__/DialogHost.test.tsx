import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { DialogHost, toneOf } from '../DialogHost';
import { clearDialogs } from '../dialogQueue';

afterEach(async () => {
  await act(async () => clearDialogs());
});

test('while mounted, Alert.alert shows the app dialog, and it is restored on unmount', async () => {
  const original = Alert.alert;
  const view = await render(<DialogHost />);
  expect(Alert.alert).not.toBe(original);
  await view.unmount();
  expect(Alert.alert).toBe(original);
});

test('shows the title and message, and a pressed button runs after the dialog closes', async () => {
  const onDelete = jest.fn();
  const onCancel = jest.fn();
  await render(<DialogHost />);
  await act(async () =>
    Alert.alert('Delete forever?', '"intro" will be removed.', [
      { text: 'Cancel', style: 'cancel', onPress: onCancel },
      { text: 'Delete forever', style: 'destructive', onPress: onDelete },
    ]),
  );
  expect(screen.getByText('Delete forever?')).toBeTruthy();
  expect(screen.getByText('"intro" will be removed.')).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: 'Delete forever' }));
  expect(onDelete).toHaveBeenCalledTimes(1);
  expect(onCancel).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByText('Delete forever?')).toBeNull()); // sinks first
});

test('with no buttons it offers OK', async () => {
  await render(<DialogHost />);
  await act(async () => Alert.alert('Cannot open', 'No app could open that.'));
  await fireEvent.press(screen.getByRole('button', { name: 'OK' }));
  await waitFor(() => expect(screen.queryByText('Cannot open')).toBeNull());
});

test('a second message waits for the first to be answered', async () => {
  await render(<DialogHost />);
  await act(async () => {
    Alert.alert('First');
    Alert.alert('Second');
  });
  expect(screen.getByText('First')).toBeTruthy();
  expect(screen.queryByText('Second')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'OK' }));
  expect(screen.getByText('Second')).toBeTruthy();
});

test('clearDialogs removes everything without pressing a button', async () => {
  const onPress = jest.fn();
  await render(<DialogHost />);
  await act(async () => Alert.alert('Move to Trash?', 'x', [{ text: 'Go', onPress }]));
  await act(async () => clearDialogs());
  expect(screen.queryByText('Move to Trash?')).toBeNull();
  expect(onPress).not.toHaveBeenCalled();
});

test('picks the icon colour from the kind of message', () => {
  expect(toneOf('Delete?', [{ text: 'Go', style: 'destructive' }])).toBe('danger');
  expect(toneOf('Could not save', [{ text: 'OK' }])).toBe('warning');
  expect(toneOf('Cannot open', [{ text: 'OK' }])).toBe('warning');
  expect(toneOf('Cloud backup', [{ text: 'OK' }])).toBe('info');
});
