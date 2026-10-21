import * as OTPAuth from 'otpauth';

import type { TotpParams } from '@/vault';

// One-time codes (RFC 6238) made by the vetted `otpauth` library. Nothing here is custom crypto.

export const DEFAULT_TOTP: TotpParams = { algorithm: 'SHA1', digits: 6, period: 30 };

const ALGORITHMS = ['SHA1', 'SHA256', 'SHA512'] as const;
// 16 base32 characters = 80 bits, the shortest secret Google Authenticator hands out.
export const MIN_SECRET_CHARACTERS = 16;

export type TotpErrorCode =
  | 'empty'
  | 'invalid-link' // starts with otpauth:// but cannot be read
  | 'not-totp' // an otpauth:// counter (HOTP) link
  | 'invalid-secret' // not base32
  | 'too-short'
  | 'unsupported'; // algorithm, digits or period we do not support

export class TotpError extends Error {
  readonly code: TotpErrorCode;
  constructor(code: TotpErrorCode) {
    super(`2FA error: ${code}`);
    this.name = 'TotpError';
    this.code = code;
  }
}

export const TOTP_ERROR_TEXT: Record<TotpErrorCode, string> = {
  empty: 'Enter a secret key or scan a QR code.',
  'invalid-link': 'This does not look like a valid 2FA QR code or link.',
  'not-totp': 'This is a counter-based code (HOTP). KiteVault supports time-based codes only.',
  'invalid-secret':
    'The secret key may only contain the letters A to Z and the digits 2 to 7. Check for typos.',
  'too-short': 'The secret key is too short. Secret keys are at least 16 characters long.',
  unsupported:
    'This code uses settings KiteVault does not support (SHA-1, SHA-256 or SHA-512, 6 to 8 digits, 10 to 120 seconds).',
};

export type ParsedTotp = {
  secret: string; // base32, upper case, no spaces or padding
  params: TotpParams;
  issuer?: string;
  account?: string;
};

// Typed secrets come with spaces or dashes in groups of four, in any case, sometimes padded.
function normalizeSecret(text: string): string {
  const secret = text
    .replace(/[\s-]+/g, '')
    .replace(/=+$/, '')
    .toUpperCase();
  if (secret === '') throw new TotpError('empty');
  if (!/^[A-Z2-7]+$/.test(secret)) throw new TotpError('invalid-secret');
  if (secret.length < MIN_SECRET_CHARACTERS) throw new TotpError('too-short');
  return secret;
}

function checkParams(params: TotpParams): void {
  const okAlgorithm = (ALGORITHMS as readonly string[]).includes(params.algorithm);
  const okDigits = Number.isInteger(params.digits) && params.digits >= 6 && params.digits <= 8;
  const okPeriod = Number.isInteger(params.period) && params.period >= 10 && params.period <= 120;
  if (!okAlgorithm || !okDigits || !okPeriod) throw new TotpError('unsupported');
}

export const isDefaultParams = (p: TotpParams): boolean =>
  p.algorithm === DEFAULT_TOTP.algorithm &&
  p.digits === DEFAULT_TOTP.digits &&
  p.period === DEFAULT_TOTP.period;

// What to keep in the entry: nothing for the usual settings.
export const paramsToStore = (p: TotpParams): TotpParams | undefined =>
  isDefaultParams(p) ? undefined : p;

// Reads what the user scanned or pasted: an otpauth://totp/... link or just the secret key.
// Throws TotpError, with a code that has a plain-language text in TOTP_ERROR_TEXT.
export function parseTotpInput(input: string): ParsedTotp {
  const text = input.trim();
  if (text === '') throw new TotpError('empty');

  let parsed: ParsedTotp;
  if (/^otpauth:\/\//i.test(text)) {
    const algorithm = /[?&]algorithm=([^&]*)/i.exec(text)?.[1];
    if (
      algorithm !== undefined &&
      !(ALGORITHMS as readonly string[]).includes(algorithm.toUpperCase())
    ) {
      throw new TotpError('unsupported');
    }
    let otp: OTPAuth.HOTP | OTPAuth.TOTP;
    try {
      otp = OTPAuth.URI.parse(text);
    } catch {
      throw new TotpError(/^otpauth:\/\/hotp/i.test(text) ? 'not-totp' : 'invalid-link');
    }
    if (!(otp instanceof OTPAuth.TOTP)) throw new TotpError('not-totp');
    const params = {
      algorithm: otp.algorithm as TotpParams['algorithm'],
      digits: otp.digits,
      period: otp.period,
    };
    checkParams(params);
    parsed = {
      secret: normalizeSecret(otp.secret.base32),
      params,
      issuer: otp.issuer || undefined,
      account: otp.label || undefined,
    };
  } else {
    parsed = { secret: normalizeSecret(text), params: { ...DEFAULT_TOTP } };
  }

  // Make sure a code can really be made from it.
  generateCode(parsed.secret, parsed.params, Date.now());
  return parsed;
}

export type Code = {
  digits: string; // the code itself, for example "287082"
  secondsLeft: number; // whole seconds until it changes (1 to period)
  period: number;
};

function makeTotp(secret: string, params: TotpParams): OTPAuth.TOTP {
  // The library skips characters it does not know, which would quietly make wrong codes.
  if (!/^[A-Z2-7]+=*$/.test(secret)) throw new TotpError('invalid-secret');
  return new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secret),
    algorithm: params.algorithm,
    digits: params.digits,
    period: params.period,
  });
}

// The code valid at `nowMs` (milliseconds since 1970).
export function generateCode(
  secret: string,
  params: TotpParams = DEFAULT_TOTP,
  nowMs: number = Date.now(),
): Code {
  const totp = makeTotp(secret, params);
  const seconds = Math.floor(nowMs / 1000);
  return {
    digits: totp.generate({ timestamp: nowMs }),
    secondsLeft: params.period - (seconds % params.period),
    period: params.period,
  };
}

// Like generateCode, but null for a stored secret that cannot be used (for example one imported
// from a file with a typo), so a bad entry shows a message instead of crashing the screen.
export function tryGenerateCode(
  secret: string,
  params: TotpParams | undefined,
  nowMs: number,
): Code | null {
  try {
    return generateCode(secret.replace(/\s+/g, '').toUpperCase(), params ?? DEFAULT_TOTP, nowMs);
  } catch {
    return null;
  }
}

// "287082" -> "287 082", "28708242" -> "2870 8242"
export function formatCode(code: string): string {
  const half = Math.ceil(code.length / 2);
  return `${code.slice(0, half)} ${code.slice(half)}`;
}

// A link other authenticator apps understand; used when a CSV export must keep the settings.
export function toOtpauthUri(label: string, secret: string, params?: TotpParams): string {
  const p = params ?? DEFAULT_TOTP;
  const query = `secret=${secret}&algorithm=${p.algorithm}&digits=${p.digits}&period=${p.period}`;
  return `otpauth://totp/${encodeURIComponent(label)}?${query}`;
}
