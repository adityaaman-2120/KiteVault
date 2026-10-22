package expo.modules.kitevaultkeystore.autofill

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DomainMatcherTest {
  // A tiny list that behaves like the real one.
  private val psl =
    PublicSuffixList(
      sequenceOf("// comment", "com", "uk", "co.uk", "github.io", "*.ck", "!www.ck", "io")
    )

  @Test
  fun normalizesAddressesToPlainHosts() {
    assertEquals("example.com", DomainMatcher.normalizeHost("https://www.Example.com/path?q=1#x"))
    assertEquals("example.com", DomainMatcher.normalizeHost("EXAMPLE.com"))
    assertEquals("example.com", DomainMatcher.normalizeHost("http://example.com:8080/"))
    assertEquals("example.com", DomainMatcher.normalizeHost("example.com."))
    assertEquals("a.example.com", DomainMatcher.normalizeHost("a.example.com"))
  }

  @Test
  fun rejectsAddressesThatAreNotWebAddresses() {
    assertNull(DomainMatcher.normalizeHost(""))
    assertNull(DomainMatcher.normalizeHost("   "))
    assertNull(DomainMatcher.normalizeHost("androidapp://com.example.app"))
    assertNull(DomainMatcher.normalizeHost("ftp://example.com"))
    assertNull(DomainMatcher.normalizeHost("javascript:alert(1)"))
    assertNull(DomainMatcher.normalizeHost("[::1]"))
    assertNull(DomainMatcher.normalizeHost("exa mple.com"))
    assertNull(DomainMatcher.normalizeHost("exa\$mple.com"))
    // disguises: user info, backslashes, control characters
    assertNull(DomainMatcher.normalizeHost("http://user:pw@example.com/"))
    assertNull(DomainMatcher.normalizeHost("https://bank.com@evil.test/"))
    assertNull(DomainMatcher.normalizeHost("https://evil.test\\@bank.com"))
    assertNull(DomainMatcher.normalizeHost("https://bank.com\u0000.evil.test"))
    assertNull(DomainMatcher.normalizeHost("https://bank.com\n.evil.test"))
  }

  @Test
  fun foreignLettersBecomePunycodeSoLookAlikesNeverEqualTheRealName() {
    val real = DomainMatcher.normalizeHost("https://apple.com")!!
    val cyrillicA = DomainMatcher.normalizeHost("https://аpple.com")!! // Cyrillic "a"
    assertTrue(cyrillicA.startsWith("xn--"))
    assertFalse(real == cyrillicA)
    assertFalse(DomainMatcher.matches("https://apple.com", cyrillicA, psl))
    assertFalse(DomainMatcher.matches("https://аpple.com", real, psl))
    // And a real internationalised name still matches itself.
    val bucher = DomainMatcher.normalizeHost("https://bücher.example")!!
    assertTrue(DomainMatcher.matches("https://BÜCHER.example/login", bucher, psl))
  }

  @Test
  fun sameHostMatchesWhateverTheSchemePathOrWww() {
    assertTrue(DomainMatcher.matches("http://www.example.com/login", "example.com", psl))
    assertTrue(DomainMatcher.matches("example.com", "example.com", psl))
    assertTrue(DomainMatcher.matches("https://login.example.com", "login.example.com", psl))
  }

  @Test
  fun subSitesOfARegistrableDomainMatch() {
    assertTrue(DomainMatcher.matches("https://example.com", "login.example.com", psl))
    assertTrue(DomainMatcher.matches("https://example.com", "a.b.example.com", psl))
    assertTrue(DomainMatcher.matches("https://example.co.uk", "login.example.co.uk", psl))
  }

  @Test
  fun aSubSiteEntryDoesNotMatchItsParentOrItsSiblings() {
    assertFalse(DomainMatcher.matches("https://login.example.com", "example.com", psl))
    assertFalse(DomainMatcher.matches("https://login.example.com", "other.example.com", psl))
    // mail.example.com is not itself a registrable domain, so it matches only itself.
    assertFalse(DomainMatcher.matches("https://mail.example.com", "x.mail.example.com", psl))
  }

  @Test
  fun lookAlikeAndDecoyHostsNeverMatch() {
    val saved = "https://bank.com"
    assertFalse(DomainMatcher.matches(saved, "bank.com.evil.test", psl))
    assertFalse(DomainMatcher.matches(saved, "evilbank.com", psl))
    assertFalse(DomainMatcher.matches(saved, "bank-com.test", psl))
    assertFalse(DomainMatcher.matches(saved, "bank.co", psl))
    assertFalse(DomainMatcher.matches(saved, "xbank.com", psl))
    assertFalse(DomainMatcher.matches(saved, "bank.com.", psl)) // not normalized: never matches
    assertFalse(DomainMatcher.matches(saved, "", psl))
  }

  @Test
  fun sharedEndingsNeverGiveOneCustomerAnothersLogin() {
    // github.io and co.uk are shared by many owners.
    assertFalse(DomainMatcher.matches("https://github.io", "evil.github.io", psl))
    assertFalse(DomainMatcher.matches("https://co.uk", "evil.co.uk", psl))
    assertFalse(DomainMatcher.matches("https://com", "evil.com", psl))
    // But a customer's own name under a shared ending matches its own sub-sites.
    assertTrue(DomainMatcher.matches("https://me.github.io", "app.me.github.io", psl))
    assertFalse(DomainMatcher.matches("https://me.github.io", "you.github.io", psl))
  }

  @Test
  fun ipAddressesMatchOnlyThemselves() {
    assertTrue(DomainMatcher.matches("http://192.168.0.1/admin", "192.168.0.1", psl))
    assertFalse(DomainMatcher.matches("http://192.168.0.1", "1.192.168.0.1", psl))
    assertFalse(DomainMatcher.matches("http://168.0.1", "192.168.0.1", psl))
  }

  @Test
  fun androidAppAddressesAreNeverWebAddresses() {
    assertFalse(DomainMatcher.matches("androidapp://example.com", "example.com", psl))
  }

  @Test
  fun publicSuffixRulesFollowTheSpecification() {
    assertEquals("example.com", psl.registrableDomain("a.b.example.com"))
    assertEquals("example.co.uk", psl.registrableDomain("a.example.co.uk"))
    assertNull(psl.registrableDomain("co.uk"))
    assertNull(psl.registrableDomain("com"))
    // wildcard *.ck makes "anything.ck" a suffix, with www.ck as the exception
    assertNull(psl.registrableDomain("foo.ck"))
    assertEquals("bar.foo.ck", psl.registrableDomain("x.bar.foo.ck"))
    assertEquals("www.ck", psl.registrableDomain("www.ck"))
    // unknown endings count as a one-label suffix
    assertEquals("example.unknowntld", psl.registrableDomain("a.example.unknowntld"))
  }

  @Test
  fun theBundledListIsLoadedAndBehavesSensibly() {
    val file = File("src/main/assets/public_suffix_list.dat")
    assertTrue("bundled list missing: ${file.absolutePath}", file.isFile)
    val real = file.useLines { PublicSuffixList(it) }
    assertEquals("example.com", real.registrableDomain("login.example.com"))
    assertEquals("example.co.uk", real.registrableDomain("a.b.example.co.uk"))
    assertTrue(real.isPublicSuffix("github.io"))
    assertTrue(real.isPublicSuffix("blogspot.com"))
    assertEquals("me.github.io", real.registrableDomain("x.me.github.io"))
    assertFalse(DomainMatcher.matches("https://github.io", "evil.github.io", real))
    assertFalse(DomainMatcher.matches("https://blogspot.com", "evil.blogspot.com", real))
    assertTrue(DomainMatcher.matches("https://example.com", "login.example.com", real))
  }
}
