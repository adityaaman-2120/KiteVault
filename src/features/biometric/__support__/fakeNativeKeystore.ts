import type { UnlockState } from '@/native/keystore/nativeModule';

// An in-memory stand-in for the Kotlin module, used in unit tests only. It does not simulate the
// Keystore or the policy (those live in Kotlin); it lets tests choose what the native side reports.
type NativeFailure = { code: string; message?: string };

function nativeError({ code, message }: NativeFailure): Error {
  return Object.assign(new Error(message ?? code), { code });
}

type FakeNative = {
  available: boolean;
  state: UnlockState;
  stored: Uint8Array | null;
  failNext: NativeFailure | null;
  isBiometricAvailable: jest.Mock<boolean, []>;
  getUnlockState: jest.Mock<Promise<UnlockState>, []>;
  enableBiometricUnlock: jest.Mock<Promise<void>, [Uint8Array]>;
  unlockWithBiometrics: jest.Mock<Promise<Uint8Array>, []>;
  disableBiometricUnlock: jest.Mock<void, []>;
  recordPasswordUnlock: jest.Mock<void, []>;
  reset: () => void;
};

export const fakeNative: FakeNative = {
  available: true,
  state: 'disabled' as UnlockState,
  stored: null as Uint8Array | null,
  failNext: null as NativeFailure | null,

  isBiometricAvailable: jest.fn(() => fakeNative.available),
  getUnlockState: jest.fn(async () => fakeNative.state),
  enableBiometricUnlock: jest.fn(async (vaultKey: Uint8Array) => {
    if (fakeNative.failNext) {
      const failure = fakeNative.failNext;
      fakeNative.failNext = null;
      throw nativeError(failure);
    }
    fakeNative.stored = vaultKey.slice(); // the real module keeps its own encrypted copy
    fakeNative.state = 'ready';
  }),
  unlockWithBiometrics: jest.fn(async () => {
    if (fakeNative.failNext) {
      const failure = fakeNative.failNext;
      fakeNative.failNext = null;
      throw nativeError(failure);
    }
    if (!fakeNative.stored) throw nativeError({ code: 'ERR_BIOMETRIC_NOT_ENABLED' });
    return fakeNative.stored.slice();
  }),
  disableBiometricUnlock: jest.fn(() => {
    fakeNative.stored = null;
    fakeNative.state = 'disabled';
  }),
  recordPasswordUnlock: jest.fn(),

  reset() {
    fakeNative.available = true;
    fakeNative.state = 'disabled';
    fakeNative.stored = null;
    fakeNative.failNext = null;
    for (const key of [
      'isBiometricAvailable',
      'getUnlockState',
      'enableBiometricUnlock',
      'unlockWithBiometrics',
      'disableBiometricUnlock',
      'recordPasswordUnlock',
    ] as const) {
      fakeNative[key].mockClear();
    }
  },
};
