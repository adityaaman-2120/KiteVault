import { native, type UnlockState } from './nativeModule';

export type { UnlockState } from './nativeModule';

export type BiometricErrorKind =
  | 'unsupported' // this build has no native module
  | 'unavailable' // no biometrics set up / removed
  | 'not-enabled'
  | 'cancelled'
  | 'locked-out' // too many wrong fingers; the system blocks biometrics for a while
  | 'key-invalidated' // biometrics changed or the stored key is unusable
  | 'reauth-required' // restart, 7 days or 5 unlocks reached
  | 'busy'
  | 'failed';

export type ReauthReason = 'REBOOT' | 'EXPIRED' | 'USE_LIMIT';

export class BiometricError extends Error {
  readonly kind: BiometricErrorKind;
  readonly reason?: ReauthReason;

  constructor(kind: BiometricErrorKind, reason?: ReauthReason) {
    super(`Biometric error: ${kind}`);
    this.name = 'BiometricError';
    this.kind = kind;
    this.reason = reason;
  }
}

const KIND_BY_CODE: Record<string, BiometricErrorKind> = {
  ERR_BIOMETRIC_UNAVAILABLE: 'unavailable',
  ERR_BIOMETRIC_NOT_ENABLED: 'not-enabled',
  ERR_BIOMETRIC_USER_CANCELED: 'cancelled',
  ERR_BIOMETRIC_LOCKED_OUT: 'locked-out',
  ERR_BIOMETRIC_KEY_INVALIDATED: 'key-invalidated',
  ERR_BIOMETRIC_REAUTH_REQUIRED: 'reauth-required',
  ERR_BIOMETRIC_BUSY: 'busy',
};

function toBiometricError(error: unknown): BiometricError {
  if (error instanceof BiometricError) return error;
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
  const kind = (code && KIND_BY_CODE[code]) || 'failed';
  const reason =
    kind === 'reauth-required' && ['REBOOT', 'EXPIRED', 'USE_LIMIT'].includes(message ?? '')
      ? (message as ReauthReason)
      : undefined;
  return new BiometricError(kind, reason);
}

export function isBiometricAvailable(): boolean {
  try {
    return native?.isBiometricAvailable() ?? false;
  } catch {
    return false;
  }
}

export async function getUnlockState(): Promise<UnlockState> {
  try {
    return (await native?.getUnlockState()) ?? 'disabled';
  } catch {
    return 'disabled';
  }
}

// Shows the system dialog, then stores the vault key under a new hardware-backed key.
export async function enableBiometricUnlock(vaultKey: Uint8Array): Promise<void> {
  if (!native) throw new BiometricError('unsupported');
  try {
    await native.enableBiometricUnlock(vaultKey);
  } catch (error) {
    throw toBiometricError(error);
  }
}

// Shows the system dialog and returns the vault key. The caller owns (and must wipe) the bytes.
export async function unlockWithBiometrics(): Promise<Uint8Array> {
  if (!native) throw new BiometricError('unsupported');
  try {
    return await native.unlockWithBiometrics();
  } catch (error) {
    throw toBiometricError(error);
  }
}

export function disableBiometricUnlock(): void {
  try {
    native?.disableBiometricUnlock();
  } catch {
    // Nothing more to clean up.
  }
}

// Call after the master password was typed correctly: restarts the 7-day / 5-unlock counters.
export function recordPasswordUnlock(): void {
  try {
    native?.recordPasswordUnlock();
  } catch {
    // A failure here only means biometrics may ask for the password sooner.
  }
}
