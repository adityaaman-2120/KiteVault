package expo.modules.kitevaultkeystore.autofill

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RequestOriginTest {
  private fun box(index: Int, domain: String?, scheme: String? = "https") =
    FieldNode(index = index, webDomain = domain, webScheme = scheme)

  private fun decide(
    user: FieldNode?,
    pass: FieldNode,
    trusted: Boolean,
    pkg: String = "com.android.chrome",
  ) =
    RequestOrigin.decide(
      ParsedScreen(pkg, listOfNotNull(user, pass)),
      LoginForm(pass, user),
      trusted,
    )

  @Test
  fun aTrustedBrowserOnHttpsGivesAWebOrigin() {
    val result = decide(box(0, "Login.Example.com"), box(1, "login.example.com"), trusted = true)
    assertEquals(OriginResult.Known(Origin.Web("login.example.com")), result)
  }

  @Test
  fun aPasswordOnlyFormIsFine() {
    assertEquals(
      OriginResult.Known(Origin.Web("example.com")),
      decide(null, box(0, "www.example.com"), true),
    )
  }

  @Test
  fun anyOtherAppIsIdentifiedByPackageAndItsClaimedWebAddressIsIgnored() {
    val evil = decide(box(0, "bank.com"), box(1, "bank.com"), trusted = false, pkg = "com.evil.app")
    assertEquals(OriginResult.Known(Origin.App("com.evil.app")), evil)
  }

  @Test
  fun httpIsRefused() {
    val result = decide(box(0, "example.com", "http"), box(1, "example.com", "http"), true)
    assertEquals(OriginResult.Refused(Refusal.NOT_HTTPS, "example.com"), result)
  }

  @Test
  fun anUnknownSchemeIsTreatedLikeHttp() {
    val result = decide(null, box(0, "example.com", null), true)
    assertEquals(OriginResult.Refused(Refusal.NOT_HTTPS, "example.com"), result)
  }

  @Test
  fun aUsernameBoxFromAnotherSiteMakesTheWholePageRefused() {
    val result = decide(box(0, "evil.test"), box(1, "bank.com"), true)
    assertEquals(OriginResult.Refused(Refusal.MIXED_DOMAINS, "bank.com"), result)
  }

  @Test
  fun aUsernameBoxWithNoDomainOnABrowserPageIsRefused() {
    val result = decide(box(0, null), box(1, "bank.com"), true)
    assertEquals(OriginResult.Refused(Refusal.MIXED_DOMAINS, "bank.com"), result)
  }

  @Test
  fun aBrowserScreenWithoutAnyWebAddressIsRefused() {
    val result = decide(null, box(0, null), true)
    assertEquals(OriginResult.Refused(Refusal.NO_DOMAIN, null), result)
    assertTrue(decide(null, box(0, "  "), true) is OriginResult.Refused)
  }
}
