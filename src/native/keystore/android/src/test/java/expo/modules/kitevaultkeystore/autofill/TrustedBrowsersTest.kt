package expo.modules.kitevaultkeystore.autofill

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TrustedBrowsersTest {
  private val chromeCert =
    TrustedBrowserData.certificatesByPackage.getValue("com.android.chrome").first()

  @Test
  fun chromeWithItsRealCertificateIsTrusted() {
    assertTrue(TrustedBrowsers.isTrusted("com.android.chrome", setOf(chromeCert)))
  }

  @Test
  fun aFakeWithTheSamePackageButAnotherCertificateIsNot() {
    assertFalse(TrustedBrowsers.isTrusted("com.android.chrome", setOf("00".repeat(32))))
  }

  @Test
  fun anExtraUnknownSignerMakesItUntrusted() {
    assertFalse(
      TrustedBrowsers.isTrusted("com.android.chrome", setOf(chromeCert, "11".repeat(32)))
    )
  }

  @Test
  fun noCertificateOrAnUnknownPackageIsNotTrusted() {
    assertFalse(TrustedBrowsers.isTrusted("com.android.chrome", emptySet()))
    assertFalse(TrustedBrowsers.isTrusted("com.evil.browser", setOf(chromeCert)))
  }

  @Test
  fun everyListedBrowserHasAtLeastOneValidFingerprint() {
    for ((pkg, certs) in TrustedBrowserData.certificatesByPackage) {
      assertTrue(pkg, certs.isNotEmpty())
      for (c in certs) assertTrue("$pkg $c", c.matches(Regex("[0-9A-F]{64}")))
    }
  }
}
