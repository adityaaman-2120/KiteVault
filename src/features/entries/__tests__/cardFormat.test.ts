import { formatExpiry } from '../cardFormat';

// Types a string one key at a time, like a keyboard.
function type(keys: string): string {
  let text = '';
  for (const key of keys) text = formatExpiry(text, text + key);
  return text;
}

describe('formatExpiry', () => {
  test('a first digit of 2-9 becomes a month with the slash', () => {
    expect(type('9')).toBe('09/');
    expect(type('2')).toBe('02/');
    expect(type('928')).toBe('09/28');
  });

  test('a first digit of 0 or 1 waits for the second', () => {
    expect(type('0')).toBe('0');
    expect(type('1')).toBe('1');
    expect(type('09')).toBe('09/');
    expect(type('12')).toBe('12/');
    expect(type('1228')).toBe('12/28');
  });

  test('13 to 19 cannot be a month, so the digit starts the year', () => {
    expect(type('13')).toBe('01/3');
    expect(type('1')).toBe('1');
  });

  test('00 is not a month', () => {
    expect(type('00')).toBe('0');
  });

  test('stops at four digits', () => {
    expect(type('092812')).toBe('09/28');
  });

  test('pasting works', () => {
    expect(formatExpiry('', '0928')).toBe('09/28');
    expect(formatExpiry('', '9/28')).toBe('09/28');
    expect(formatExpiry('', '09/28')).toBe('09/28');
    expect(formatExpiry('', 'ab')).toBe('');
  });

  test('backspace removes the slash together with the month digit', () => {
    expect(formatExpiry('09/', '09')).toBe('0');
    expect(formatExpiry('09/2', '09/')).toBe('09/');
    expect(formatExpiry('09/28', '09/2')).toBe('09/2');
    expect(formatExpiry('0', '')).toBe('');
  });
});
