import { fireEvent, render, screen } from '@testing-library/react-native';

import { copySecret } from '@/features/clipboard/clipboardService';

import { PasswordGeneratorPanel } from '../PasswordGeneratorPanel';
import { WORDLIST } from '../wordlist';

jest.mock('@/features/clipboard/clipboardService', () => ({ copySecret: jest.fn(async () => {}) }));
// The native slider is replaced by a plain element that keeps the same props.
jest.mock('@react-native-community/slider', () => 'Slider');

const shown = () => screen.getByTestId('generated-password').props.children as string;
const length = () => screen.getByLabelText('Password length');
const toggle = (label: string) => screen.getByLabelText(label);

beforeEach(() => jest.clearAllMocks());

describe('password mode', () => {
  test('starts with a 20-character password and a strength rating', async () => {
    await render(<PasswordGeneratorPanel />);
    expect([...shown()]).toHaveLength(20);
    expect(screen.getByLabelText(/Password strength: Strong/)).toBeTruthy();
    expect(screen.getByText(/About \d+ bits of randomness/)).toBeTruthy();
    expect(screen.getByText('Length: 20')).toBeTruthy();
  });

  test('the slider sets the length from 8 to 64 and makes a new password', async () => {
    await render(<PasswordGeneratorPanel />);
    for (const value of [8, 33, 64]) {
      await fireEvent(length(), 'valueChange', value);
      expect([...shown()]).toHaveLength(value);
      expect(screen.getByText(`Length: ${value}`)).toBeTruthy();
    }
    expect(length().props.minimumValue).toBe(8);
    expect(length().props.maximumValue).toBe(64);
    expect(length().props.step).toBe(1);
  });

  test('shorter, simpler passwords get a lower rating', async () => {
    await render(<PasswordGeneratorPanel />);
    await fireEvent(length(), 'valueChange', 8);
    await fireEvent(toggle('Symbols (!@#$...)'), 'valueChange', false);
    await fireEvent(toggle('Numbers (0-9)'), 'valueChange', false);
    await fireEvent(toggle('Uppercase (A-Z)'), 'valueChange', false);
    expect(shown()).toMatch(/^[a-z]{8}$/);
    expect(screen.getByLabelText(/Password strength: Weak/)).toBeTruthy();
  });

  test('toggles change the characters used', async () => {
    await render(<PasswordGeneratorPanel />);
    await fireEvent(length(), 'valueChange', 40);
    await fireEvent(toggle('Symbols (!@#$...)'), 'valueChange', false);
    await fireEvent(toggle('Lowercase (a-z)'), 'valueChange', false);
    await fireEvent(toggle('Uppercase (A-Z)'), 'valueChange', false);
    expect(shown()).toMatch(/^[0-9]{40}$/);

    await fireEvent(toggle('Numbers (0-9)'), 'valueChange', false); // would leave nothing
    expect(shown()).toMatch(/^[0-9]{40}$/); // unchanged
    expect(screen.getByText('Keep at least one kind of character switched on.')).toBeTruthy();
  });

  test('look-alike characters can be avoided', async () => {
    await render(<PasswordGeneratorPanel />);
    await fireEvent(length(), 'valueChange', 64);
    await fireEvent(toggle('Avoid look-alike characters'), 'valueChange', true);
    for (let i = 0; i < 30; i++) {
      await fireEvent.press(screen.getByRole('button', { name: 'Regenerate' }));
      expect(shown()).not.toMatch(/[Il1|O0o]/);
    }
  });

  test('Regenerate gives a new password', async () => {
    await render(<PasswordGeneratorPanel />);
    const first = shown();
    await fireEvent.press(screen.getByRole('button', { name: 'Regenerate' }));
    expect(shown()).not.toBe(first);
  });

  test('Copy sends exactly what is shown to the auto-clearing clipboard', async () => {
    await render(<PasswordGeneratorPanel />);
    await fireEvent.press(screen.getByRole('button', { name: 'Copy' }));
    expect(copySecret).toHaveBeenCalledTimes(1);
    expect(copySecret).toHaveBeenCalledWith(shown());
  });
});

describe('passphrase mode', () => {
  test('shows six words from the list by default', async () => {
    await render(<PasswordGeneratorPanel />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Passphrase' }));
    const words = shown().split('-');
    expect(words).toHaveLength(6);
    for (const word of words) expect(WORDLIST).toContain(word);
    expect(screen.getByLabelText(/Password strength: Good/)).toBeTruthy(); // about 77 bits
  });

  test('word count, separator, capitals and number can be changed', async () => {
    await render(<PasswordGeneratorPanel />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Passphrase' }));

    await fireEvent(screen.getByLabelText('Number of words'), 'valueChange', 8);
    expect(shown().split('-')).toHaveLength(8);
    expect(screen.getByLabelText(/Password strength: Strong/)).toBeTruthy();

    await fireEvent.press(screen.getByRole('radio', { name: 'space' }));
    expect(shown().split(' ')).toHaveLength(8);

    await fireEvent(toggle('Capitalize words'), 'valueChange', true);
    for (const word of shown().split(' ')) expect(word).toMatch(/^[A-Z]/);

    await fireEvent(toggle('Add a number'), 'valueChange', true);
    expect(shown().match(/\d/g)).toHaveLength(1);
  });

  test('switching back to a password keeps the earlier settings', async () => {
    await render(<PasswordGeneratorPanel />);
    await fireEvent(length(), 'valueChange', 12);
    await fireEvent.press(screen.getByRole('radio', { name: 'Passphrase' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Password' }));
    expect([...shown()]).toHaveLength(12);
  });
});

describe('"Use this password"', () => {
  test('is not shown on the Generator tab', async () => {
    await render(<PasswordGeneratorPanel />);
    expect(screen.queryByRole('button', { name: 'Use this password' })).toBeNull();
  });

  test('hands over the password that is currently shown', async () => {
    const onUse = jest.fn();
    await render(<PasswordGeneratorPanel onUse={onUse} />);
    await fireEvent(length(), 'valueChange', 30);
    await fireEvent.press(screen.getByRole('button', { name: 'Use this password' }));
    expect(onUse).toHaveBeenCalledTimes(1);
    expect(onUse).toHaveBeenCalledWith(shown());
    expect([...onUse.mock.calls[0][0]]).toHaveLength(30);
  });

  test('also hands over a passphrase', async () => {
    const onUse = jest.fn();
    await render(<PasswordGeneratorPanel onUse={onUse} />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Passphrase' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Use this password' }));
    expect(onUse).toHaveBeenCalledWith(shown());
  });
});
