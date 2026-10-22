import { act, render, renderHook, screen } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { entry } from '@/features/entries/__support__/entryTestUtils';

import { AuthenticatorList } from '../AuthenticatorList';
import { generateCode, parseTotpInput, toOtpauthUri, TotpError } from '../totp';
import { useNow } from '../useNow';

jest.mock('@/features/clipboard/clipboardService', () => ({ copySecret: jest.fn(async () => {}) }));

const SECRET = 'JBSWY3DPEHPK3PXP';
const codeOf = (input: string) => {
  try {
    parseTotpInput(input);
  } catch (e) {
    return (e as TotpError).code;
  }
  return 'no error';
};

describe('input that is only separators', () => {
  test.each(['---', '===', ' - = - ', '   \n  '])('%j counts as empty', (text) => {
    expect(codeOf(text)).toBe('empty');
  });
});

describe('links with missing parts', () => {
  test('no issuer is fine; a link with no name at all is refused', () => {
    const parsed = parseTotpInput(`otpauth://totp/x?secret=${SECRET}`);
    expect(parsed.issuer).toBeUndefined();
    expect(parsed.account).toBe('x');
    expect(parsed.secret).toBe(SECRET);
    expect(codeOf(`otpauth://totp/?secret=${SECRET}`)).toBe('invalid-link');
  });

  test('upper-case scheme and counter links are told apart', () => {
    expect(parseTotpInput(`OTPAUTH://TOTP/x?secret=${SECRET}`).secret).toBe(SECRET);
    expect(codeOf(`OTPAUTH://HOTP/x?secret=${SECRET}&counter=1`)).toBe('not-totp');
    expect(codeOf('otpauth://nonsense')).toBe('invalid-link');
    expect(codeOf('otpauth://')).toBe('invalid-link');
  });

  test('a secret in the link is checked like a typed one', () => {
    expect(codeOf('otpauth://totp/x?secret=SHORT')).toBe('too-short');
    expect(codeOf('otpauth://totp/x?secret=')).not.toBe('no error');
  });
});

describe('defaults', () => {
  test('a code can be made with only a secret (usual settings, current time)', () => {
    const code = generateCode(SECRET);
    expect(code.digits).toMatch(/^\d{6}$/);
    expect(code.period).toBe(30);
    expect(code.secondsLeft).toBeGreaterThanOrEqual(1);
    expect(code.secondsLeft).toBeLessThanOrEqual(30);
  });

  test('a link made without settings uses the usual ones and reads back', () => {
    const uri = toOtpauthUri('Label', SECRET);
    expect(uri).toContain('algorithm=SHA1&digits=6&period=30');
    expect(parseTotpInput(uri).params).toEqual({ algorithm: 'SHA1', digits: 6, period: 30 });
  });

  test('a code for a secret that is not base32 is refused when it is made', () => {
    expect(() => generateCode('not base32!')).toThrow(TotpError);
  });
});

describe('useNow', () => {
  beforeEach(() => jest.useFakeTimers({ now: 1_000_000 }));
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('moves forward every second and stops when the screen closes', async () => {
    const clear = jest.spyOn(globalThis, 'clearInterval');
    const { result, unmount } = await renderHook(() => useNow());
    expect(result.current).toBe(1_000_000);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3000);
    });
    expect(result.current).toBe(1_003_000);
    await unmount();
    expect(clear).toHaveBeenCalled();
  });

  test('catches up at once when the app returns to the front', async () => {
    let listener: (state: string) => void = () => {};
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: never) => {
      listener = fn;
      return { remove };
    }) as never);
    const { result, unmount } = await renderHook(() => useNow(60_000));
    jest.setSystemTime(1_500_000); // time passed while timers were paused
    await act(async () => listener('background'));
    expect(result.current).toBe(1_000_000);
    await act(async () => listener('active'));
    expect(result.current).toBe(1_500_000);
    await unmount();
    expect(remove).toHaveBeenCalled();
  });
});

describe('the Authenticator list', () => {
  test('shows entries without a user name, and a bad saved secret as a message', async () => {
    await render(
      <AuthenticatorList
        onOpen={jest.fn()}
        entries={[
          entry({ id: 'a', title: 'No user', username: '', totpSecret: SECRET }),
          entry({ id: 'b', title: 'Broken', username: 'u', totpSecret: 'not valid!' }),
        ]}
      />,
    );
    expect(screen.getByText('No user')).toBeTruthy();
    expect(screen.getByText('Broken · u')).toBeTruthy();
    expect(screen.getByText(/not valid. Replace it/)).toBeTruthy();
  });
});
