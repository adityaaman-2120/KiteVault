package expo.modules.kitevaultkeystore.autofill

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LoginMatcherTest {
  private val psl = PublicSuffixList(sequenceOf("com", "co.uk", "github.io"))

  private fun login(
    id: String,
    title: String = id,
    urls: List<String> = emptyList(),
    links: List<AppLink> = emptyList(),
  ) = LoginRecord(id, title, "user", "pw", urls, links)

  private fun ids(list: List<LoginRecord>) = list.map { it.id }

  @Test
  fun aWebPageMatchesOnlyBySavedAddresses() {
    val logins =
      listOf(
        login("a", urls = listOf("https://example.com")),
        login("b", urls = listOf("https://other.com")),
        login("c", urls = listOf("https://www.example.com/login", "https://x.com")),
        login("d", title = "example.com", urls = emptyList()), // the title says example.com: ignored
      )
    assertEquals(
      listOf("a", "c"),
      ids(LoginMatcher.match(Origin.Web("login.example.com"), logins, psl, null)),
    )
  }

  @Test
  fun titlesAndUsernamesAreNeverUsed() {
    val logins = listOf(LoginRecord("t", "Bank", "bank.com", "pw", emptyList(), emptyList()))
    assertTrue(LoginMatcher.match(Origin.Web("bank.com"), logins, psl, null).isEmpty())
  }

  private val certs = AppCertificates(current = setOf("AABB"), history = setOf("AABB", "OLD1"))
  private val app = Origin.App("com.example.app")

  @Test
  fun anAppMatchesOnlyALinkWithTheSamePackageAndCertificate() {
    val logins =
      listOf(
        login("good", links = listOf(AppLink("com.example.app", "aa:bb"))),
        login("otherPackage", links = listOf(AppLink("com.example.app2", "AABB"))),
        login("otherCert", links = listOf(AppLink("com.example.app", "CCDD"))),
        login("noLink", urls = listOf("https://example.com")),
        login("androidapp", urls = listOf("androidapp://com.example.app")),
      )
    assertEquals(listOf("good"), ids(LoginMatcher.match(app, logins, psl, certs)))
  }

  @Test
  fun aKeyRotatedAppStillMatchesAnOlderPinnedCertificate() {
    val logins = listOf(login("old", links = listOf(AppLink("com.example.app", "old1"))))
    assertEquals(listOf("old"), ids(LoginMatcher.match(app, logins, psl, certs)))
  }

  @Test
  fun anAppWhoseCertificatesCannotBeReadMatchesNothing() {
    val logins = listOf(login("good", links = listOf(AppLink("com.example.app", "AABB"))))
    assertTrue(LoginMatcher.match(app, logins, psl, null).isEmpty())
  }

  @Test
  fun aWebPageNeverMatchesAnAppLinkAndAnAppNeverMatchesAWebAddress() {
    val logins =
      listOf(
        login(
          "x",
          urls = listOf("https://com.example.app"),
          links = listOf(AppLink("com.example.app", "AABB")),
        )
      )
    assertTrue(LoginMatcher.match(Origin.Web("example.org"), logins, psl, null).isEmpty())
    assertEquals(listOf("x"), ids(LoginMatcher.match(app, logins, psl, certs)))
  }

  @Test
  fun resultsAreSortedAndCapped() {
    val logins =
      (1..30).map {
        login("id$it", title = "T%02d".format(31 - it), urls = listOf("https://example.com"))
      }
    val result = LoginMatcher.match(Origin.Web("example.com"), logins, psl, null)
    assertEquals(LoginMatcher.MAX_RESULTS, result.size)
    assertEquals("T01", result.first().title)
  }
}
