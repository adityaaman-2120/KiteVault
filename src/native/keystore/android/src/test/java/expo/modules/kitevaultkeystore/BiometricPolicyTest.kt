package expo.modules.kitevaultkeystore

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class BiometricPolicyTest {
  private val hour = 60L * 60 * 1000
  private val day = 24 * hour
  private val start = 5 * day // pretend the phone has been on for 5 days

  private fun state(unlocks: Int = 0, boot: Int = 10) =
    BiometricPolicy.State(
      passwordEnteredAtElapsedMs = start,
      bootCount = boot,
      biometricUnlocks = unlocks,
    )

  @Test
  fun allowedRightAfterPassword() {
    assertNull(BiometricPolicy.reauthReason(state(), start, 10))
  }

  @Test
  fun allowedUpToFiveUnlocksThenRequiresPassword() {
    assertNull(BiometricPolicy.reauthReason(state(unlocks = 4), start + hour, 10))
    assertEquals(
      BiometricPolicy.Reason.USE_LIMIT,
      BiometricPolicy.reauthReason(state(unlocks = 5), start + hour, 10),
    )
  }

  @Test
  fun expiresAfterSevenDays() {
    assertNull(BiometricPolicy.reauthReason(state(), start + 7 * day - 1, 10))
    assertEquals(
      BiometricPolicy.Reason.EXPIRED,
      BiometricPolicy.reauthReason(state(), start + 7 * day, 10),
    )
  }

  @Test
  fun restartIsDetectedByBootCount() {
    assertEquals(
      BiometricPolicy.Reason.REBOOT,
      BiometricPolicy.reauthReason(state(boot = 10), start + hour, 11),
    )
  }

  @Test
  fun restartIsDetectedByElapsedClockGoingBackwards() {
    // After a reboot the elapsed clock starts again from near zero.
    assertEquals(
      BiometricPolicy.Reason.REBOOT,
      BiometricPolicy.reauthReason(state(), 2 * hour, 10),
    )
  }

  @Test
  fun unknownBootCountFallsBackToTheElapsedClock() {
    val unknown = BiometricPolicy.UNKNOWN_BOOT_COUNT
    assertNull(BiometricPolicy.reauthReason(state(boot = unknown), start + hour, unknown))
    assertNull(BiometricPolicy.reauthReason(state(boot = unknown), start + hour, 42))
    assertEquals(
      BiometricPolicy.Reason.REBOOT,
      BiometricPolicy.reauthReason(state(boot = unknown), hour, 42),
    )
  }

  @Test
  fun rebootWinsOverOtherReasons() {
    assertEquals(
      BiometricPolicy.Reason.REBOOT,
      BiometricPolicy.reauthReason(state(unlocks = 9), start + 30 * day, 99),
    )
  }
}
