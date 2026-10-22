import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button, TextField } from '..';

test('Button calls onPress', async () => {
  const onPress = jest.fn();
  await render(<Button title="Go" onPress={onPress} />);
  await fireEvent.press(screen.getByText('Go'));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('secret TextField is hidden until Show is pressed', async () => {
  await render(<TextField label="Password" secret />);
  expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
  await fireEvent.press(screen.getByLabelText(/^Show/));
  expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);
});
