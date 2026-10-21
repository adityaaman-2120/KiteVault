package expo.modules.kitevaultkeystore

/**
 * Decides when biometric unlock is no longer allowed and the master password must be typed again.
 * Pure logic (no Android classes) so it can be unit tested on a normal computer.
 *
 * "Since the last password" means since the last time the master password was entered.
 */
internal object BiometricPolicy {
  const val MAX_BIOMETRIC_UNLOCKS = 5
  const val MAX_AGE_MS = 7L * 24 * 60 * 60 * 1000

  const val UNKNOWN_BOOT_COUNT = -1

  enum class Reason { REBOOT, EXPIRED, USE_LIMIT }

  data class State(
    /** Time since the phone booted (SystemClock.elapsedRealtime) at the last password entry. */
    val passwordEnteredAtElapsedMs: Long,
    /** The phone's boot counter at the last password entry, or UNKNOWN_BOOT_COUNT. */
    val bootCount: Int,
    /** Successful biometric unlocks since the last password entry. */
    val biometricUnlocks: Int,
  )

  fun reauthReason(state: State, nowElapsedMs: Long, currentBootCount: Int): Reason? {
    // The elapsed-time clock restarts from zero on every boot, so a smaller value than the one
    // we saved means the phone restarted. The boot counter is a second, direct signal.
    val bootCountChanged =
      state.bootCount != UNKNOWN_BOOT_COUNT &&
        currentBootCount != UNKNOWN_BOOT_COUNT &&
        state.bootCount != currentBootCount
    if (nowElapsedMs < state.passwordEnteredAtElapsedMs || bootCountChanged) return Reason.REBOOT

    if (nowElapsedMs - state.passwordEnteredAtElapsedMs >= MAX_AGE_MS) return Reason.EXPIRED
    if (state.biometricUnlocks >= MAX_BIOMETRIC_UNLOCKS) return Reason.USE_LIMIT
    return null
  }
}
