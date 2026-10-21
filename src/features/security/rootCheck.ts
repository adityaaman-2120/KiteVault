import JailMonkey from 'jail-monkey';

// Best-effort check for a rooted device (su binary, Magisk, root-manager apps, writable system
// paths, test-keys, ...). It only informs the user; it never blocks anything. A rooted device can
// hide from these checks, so "not detected" is not a guarantee of safety.
export function detectRootedDevice(): boolean {
  try {
    return JailMonkey.isJailBroken() === true;
  } catch {
    // Not linked or the check failed: we cannot tell, so we show no warning.
    return false;
  }
}
