import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text, View } from 'react-native';

import { Button, Callout, EdgeFade, TextField } from '..';

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

describe('Callout', () => {
  test('shows its title and a text', async () => {
    await render(
      <Callout tone="warning" title="Check first">
        Only save this if you typed it yourself.
      </Callout>,
    );
    expect(screen.getByText('Check first')).toBeTruthy();
    expect(screen.getByText('Only save this if you typed it yourself.')).toBeTruthy();
  });

  test('works without a title and with other content inside', async () => {
    await render(
      <Callout>
        <Text>Custom content</Text>
      </Callout>,
    );
    expect(screen.getByText('Custom content')).toBeTruthy();
    expect(screen.queryByText('Check first')).toBeNull();
  });

  test.each(['info', 'warning', 'success', 'danger'] as const)(
    'the %s tone renders',
    async (tone) => {
      await render(<Callout tone={tone}>Hello</Callout>);
      expect(screen.getByText('Hello')).toBeTruthy();
    },
  );
});

describe('EdgeFade', () => {
  test('lets every touch through to what is under it', async () => {
    const onPress = jest.fn();
    await render(
      <View style={{ width: 200, height: 48 }}>
        <Button title="Under the fade" onPress={onPress} />
        <EdgeFade side="right" />
      </View>,
    );
    await fireEvent.press(screen.getByText('Under the fade'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(screen.toJSON())).toContain('"pointerEvents":"none"');
  });

  test('is hidden from screen readers and works on either side', async () => {
    await render(
      <View style={{ width: 200, height: 48 }}>
        <EdgeFade side="left" width={20} />
        <EdgeFade side="right" />
      </View>,
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
