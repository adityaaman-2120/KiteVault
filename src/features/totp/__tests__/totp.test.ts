import fs from 'fs';
import path from 'path';
import * as OTPAuth from 'otpauth';

import { useVaultStore } from '@/vault';
import { vaultFile } from '@/vault/__support__/testUtils';
import {
  entry,
  storeEntries,
  unlockedVaultWith,
} from '@/features/entries/__support__/entryTestUtils';

import {
  formatCode,
  generateCode,
  isDefaultParams,
  paramsToStore,
  parseTotpInput,
  toOtpauthUri,
  tryGenerateCode,
  TotpError,
} from '../totp';
import { removeEntryTotp, setEntryTotp } from '../totpActions';

// RFC 6238, Appendix B. The same time steps are used with three different secrets.
const SECRETS = {
  SHA1: OTPAuth.Secret.fromUTF8('12345678901234567890').base32,
  SHA256: OTPAuth.Secret.fromUTF8('12345678901234567890123456789012').base32,
  SHA512: OTPAuth.Secret.fromUTF8(
    '1234567890123456789012345678901234567890123456789012345678901234',
  ).base32,
};
const VECTORS: [number, string, string, string][] = [
  // unix time, SHA1, SHA256, SHA512 (8-digit codes)
  [59, '94287082', '46119246', '90693936'],
  [1111111109, '07081804', '68084774', '25091201'],
  [1111111111, '14050471', '67062674', '99943326'],
  [1234567890, '89005924', '91819424', '93441116'],
  [2000000000, '69279037', '90698825', '38618901'],
  [20000000000, '65353130', '77737706', '47863826'],
];

describe('RFC 6238 test vectors', () => {
  test.each(VECTORS)('at %i s all three algorithms match', (seconds, sha1, sha256, sha512) => {
    const at = (algorithm: 'SHA1' | 'SHA256' | 'SHA512') =>
      generateCode(SECRETS[algorithm], { algorithm, digits: 8, period: 30 }, seconds * 1000).digits;
    expect(at('SHA1')).toBe(sha1);
    expect(at('SHA256')).toBe(sha256);
    expect(at('SHA512')).toBe(sha512);
  });

  test('the usual 6-digit code is the last six digits (RFC dynamic truncation)', () => {
    for (const [seconds, sha1] of VECTORS) {
      expect(generateCode(SECRETS.SHA1, undefined, seconds * 1000).digits).toBe(sha1.slice(-6));
    }
    expect(generateCode(SECRETS.SHA1, undefined, 59_000).digits).toBe('287082');
  });

  test('a code stays the same for the whole 30 seconds and changes at the step', () => {
    const at = (s: number) => generateCode(SECRETS.SHA1, undefined, s * 1000).digits;
    expect(at(30)).toBe(at(59));
    expect(at(59)).not.toBe(at(60));
    expect(at(60)).toBe(at(89));
  });

  test('works with a 60 second period', () => {
    const params = { algorithm: 'SHA1' as const, digits: 6, period: 60 };
    expect(generateCode(SECRETS.SHA1, params, 59_000).digits).toBe(
      generateCode(SECRETS.SHA1, params, 0).digits,
    );
  });
});

describe('countdown', () => {
  const left = (ms: number) => generateCode(SECRETS.SHA1, undefined, ms).secondsLeft;
  test('counts down from 30 to 1 and starts again', () => {
    expect(left(0)).toBe(30);
    expect(left(1_000)).toBe(29);
    expect(left(1_999)).toBe(29);
    expect(left(29_000)).toBe(1);
    expect(left(29_999)).toBe(1);
    expect(left(30_000)).toBe(30);
  });
  test('follows the period of the code', () => {
    const p = { algorithm: 'SHA1' as const, digits: 6, period: 60 };
    expect(generateCode(SECRETS.SHA1, p, 45_000).secondsLeft).toBe(15);
  });
});

describe('formatting', () => {
  test('groups the digits', () => {
    expect(formatCode('287082')).toBe('287 082');
    expect(formatCode('94287082')).toBe('9428 7082');
    expect(formatCode('1234567')).toBe('1234 567');
  });
});

describe('reading what the user scanned or pasted', () => {
  const secret = 'JBSWY3DPEHPK3PXP';

  test('a plain secret, in any case, with spaces, dashes and padding', () => {
    for (const text of [
      secret,
      secret.toLowerCase(),
      'JBSW Y3DP EHPK 3PXP',
      'jbsw-y3dp-ehpk-3pxp',
      `${secret}====`,
    ]) {
      expect(parseTotpInput(text)).toMatchObject({
        secret,
        params: { algorithm: 'SHA1', digits: 6, period: 30 },
      });
    }
  });

  test('an otpauth:// link with a name, issuer and settings', () => {
    const parsed = parseTotpInput(
      `otpauth://totp/Example:alice%40example.com?secret=${secret}&issuer=Example&algorithm=SHA256&digits=8&period=60`,
    );
    expect(parsed).toMatchObject({
      secret,
      issuer: 'Example',
      account: 'alice@example.com',
      params: { algorithm: 'SHA256', digits: 8, period: 60 },
    });
  });

  test('a link without settings uses the usual ones', () => {
    const parsed = parseTotpInput(`otpauth://totp/x?secret=${secret}`);
    expect(isDefaultParams(parsed.params)).toBe(true);
    expect(paramsToStore(parsed.params)).toBeUndefined();
  });

  test.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['JBSWY3DP', 'too-short'],
    ['JBSWY3DPEHPK3PX1', 'invalid-secret'], // 1 is not base32
    ['not a secret!', 'invalid-secret'],
    ['otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP&counter=1', 'not-totp'],
    ['otpauth://totp/x', 'invalid-link'], // no secret
    ['otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&digits=9', 'unsupported'],
    ['otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&digits=4', 'unsupported'],
    ['otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&period=5', 'unsupported'],
    ['otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&period=500', 'unsupported'],
    ['otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&algorithm=MD5', 'unsupported'],
  ])('%j is refused (%s)', (input, code) => {
    let caught: unknown;
    try {
      parseTotpInput(input);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(TotpError);
    expect(caught).toMatchObject({ code });
  });

  test('other kinds of QR code (a website, plain text) are refused', () => {
    expect(() => parseTotpInput('https://example.com/login')).toThrow(TotpError);
    expect(() => parseTotpInput('WIFI:S:home;T:WPA;P:pass;;')).toThrow(TotpError);
  });

  test('the error never contains the secret', () => {
    try {
      parseTotpInput('otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&digits=9');
    } catch (e) {
      expect(String((e as Error).message)).not.toContain('JBSWY3DP');
    }
  });

  test('a link made by toOtpauthUri reads back to the same settings', () => {
    const params = { algorithm: 'SHA512' as const, digits: 7, period: 45 };
    const parsed = parseTotpInput(toOtpauthUri('My Site: a@b', secret, params));
    expect(parsed).toMatchObject({ secret, params });
  });
});

describe('stored secrets that cannot be used', () => {
  test('give no code instead of crashing', () => {
    expect(tryGenerateCode('not base32!', undefined, 0)).toBeNull();
    expect(tryGenerateCode('', undefined, 0)).toBeNull();
  });
  test('lower case and spaces from an old import still work', () => {
    expect(tryGenerateCode('jbsw y3dp ehpk 3pxp', undefined, 59_000)).toEqual(
      tryGenerateCode('JBSWY3DPEHPK3PXP', undefined, 59_000),
    );
  });
});

describe('saving into the vault', () => {
  const SECRET = 'KRSXG5CTMVRXEZLUKRSXG5CTMVRXEZLU';

  beforeEach(() => unlockedVaultWith([entry({ id: 'e1' })]));
  afterAll(() => unlockedVaultWith([]));

  test('adds the secret to the entry and keeps the usual settings implicit', async () => {
    await setEntryTotp('e1', parseTotpInput(SECRET), () => 1234);
    expect(storeEntries()[0]).toMatchObject({ totpSecret: SECRET, updatedAt: 1234 });
    expect(storeEntries()[0]).not.toHaveProperty('totpParams');
  });

  test('stores unusual settings, and a replacement clears the old ones', async () => {
    await setEntryTotp(
      'e1',
      parseTotpInput(`otpauth://totp/x?secret=${SECRET}&digits=8&period=60`),
    );
    expect(storeEntries()[0]!.totpParams).toEqual({ algorithm: 'SHA1', digits: 8, period: 60 });
    await setEntryTotp('e1', parseTotpInput(SECRET));
    expect(storeEntries()[0]).not.toHaveProperty('totpParams');
  });

  test('is saved only inside the encrypted file', async () => {
    await setEntryTotp('e1', parseTotpInput(SECRET));
    const stored = Buffer.from(await vaultFile().bytes()).toString('latin1');
    expect(stored).not.toContain(SECRET);
    expect(stored).not.toContain('totpSecret');
  });

  test('can be removed again', async () => {
    await setEntryTotp('e1', parseTotpInput(SECRET));
    await removeEntryTotp('e1');
    expect(storeEntries()[0]).not.toHaveProperty('totpSecret');
    expect(storeEntries()[0]).not.toHaveProperty('totpParams');
  });

  test('an entry that no longer exists is reported, nothing else changes', async () => {
    await expect(setEntryTotp('gone', parseTotpInput(SECRET))).rejects.toThrow();
    expect(storeEntries()).toHaveLength(1);
  });

  test('survives locking and unlocking', async () => {
    await setEntryTotp('e1', parseTotpInput(SECRET));
    const state = useVaultStore.getState();
    state.lock();
    await state.unlock('correct horse battery staple');
    expect(storeEntries()[0]!.totpSecret).toBe(SECRET);
  });
});

describe('camera frames are never saved', () => {
  test('the 2FA code never uses a photo, video or file-writing call', () => {
    const dir = path.join(__dirname, '..');
    const sources = fs
      .readdirSync(dir)
      .filter((f) => /\.tsx?$/.test(f))
      .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
      .join('\n');
    for (const forbidden of [
      'takePictureAsync',
      'recordAsync',
      'takePicture',
      'expo-file-system',
      'expo-media-library',
      'console.',
    ]) {
      expect(sources).not.toContain(forbidden);
    }
  });
});
