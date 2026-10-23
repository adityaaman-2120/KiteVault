package expo.modules.kitevaultkeystore.autofill

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class SaveCaptureTest {
  private val password = 0x1 or 0x80

  private fun box(
    index: Int,
    hints: List<String> = emptyList(),
    domain: String? = null,
    scheme: String? = null,
    inputType: Int = 0,
    usable: Boolean = true,
  ) =
    FieldNode(
      index = index,
      autofillHints = hints,
      inputType = inputType,
      isUsable = usable,
      webDomain = domain,
      webScheme = scheme,
    )

  private fun capture(
    fields: List<FieldNode>,
    values: List<String?>,
    trustedBrowser: Boolean = false,
    pkg: String = "com.example.app",
    certs: AppCertificates? = AppCertificates(setOf("BBBB", "AAAA"), setOf("BBBB", "AAAA")),
  ) =
    SaveCapture.capture(
      ParsedScreen(pkg, fields),
      values,
      trustedBrowser,
      appLabel = { "Example App" },
      appCertificates = { certs },
    )

  private val webForm =
    listOf(
      box(0, listOf("username"), "bank.com", "https"),
      box(1, listOf("password"), "bank.com", "https"),
    )

  @Test
  fun aSignInOnAHttpsPageInATrustedBrowserIsCapturedForThatHost() {
    val save = capture(webForm, listOf("alice", "pw1"), trustedBrowser = true, pkg = "com.android.chrome")!!
    assertEquals(SaveKind.WEB, save.kind)
    assertEquals("alice", save.username)
    assertEquals("pw1", save.password)
    assertEquals("bank.com", save.host)
    assertNull(save.packageName)
  }

  @Test
  fun aSignUpFormSavesTheNewPasswordNotTheConfirmBox() {
    val fields =
      listOf(
        box(0, listOf("username"), "bank.com", "https"),
        box(1, listOf("newPassword"), "bank.com", "https"),
        box(2, listOf("newPassword"), "bank.com", "https"),
      )
    val save = capture(fields, listOf("alice", "new-pw", "new-pw"), trustedBrowser = true)!!
    assertEquals("new-pw", save.password)
  }

  @Test
  fun aSignUpWhoseConfirmBoxDiffersIsNotSaved() {
    val fields =
      listOf(
        box(0, listOf("username"), "bank.com", "https"),
        box(1, listOf("newPassword"), "bank.com", "https"),
        box(2, listOf("newPassword"), "bank.com", "https"),
      )
    assertNull(capture(fields, listOf("alice", "one", "two"), trustedBrowser = true))
  }

  @Test
  fun aChangePasswordFormSavesTheNewPassword() {
    val fields =
      listOf(
        box(0, listOf("password"), "bank.com", "https"),
        box(1, listOf("newPassword"), "bank.com", "https"),
      )
    val save = capture(fields, listOf("old-pw", "new-pw"), trustedBrowser = true)!!
    assertEquals("new-pw", save.password)
    assertEquals("", save.username)
  }

  @Test
  fun aPasswordOnlyFormIsSavedWithAnEmptyUsername() {
    val save = capture(listOf(box(0, listOf("password"), "bank.com", "https")), listOf("pw"), true)!!
    assertEquals("", save.username)
  }

  @Test
  fun nothingTypedMeansNothingToSave() {
    assertNull(capture(webForm, listOf("alice", ""), trustedBrowser = true))
    assertNull(capture(webForm, listOf("alice", null), trustedBrowser = true))
    assertNull(capture(emptyList(), emptyList(), trustedBrowser = true))
  }

  @Test
  fun anHttpPageIsNeverSaved() {
    val http =
      listOf(
        box(0, listOf("username"), "bank.com", "http"),
        box(1, listOf("password"), "bank.com", "http"),
      )
    assertNull(capture(http, listOf("alice", "pw"), trustedBrowser = true))
  }

  @Test
  fun aPageThatMixesSitesIsNeverSaved() {
    val mixed =
      listOf(
        box(0, listOf("username"), "evil.test", "https"),
        box(1, listOf("password"), "bank.com", "https"),
      )
    assertNull(capture(mixed, listOf("alice", "pw"), trustedBrowser = true))
  }

  @Test
  fun aBrowserPageWithoutAWebAddressIsNeverSaved() {
    val none = listOf(box(0, listOf("password")))
    assertNull(capture(none, listOf("pw"), trustedBrowser = true))
  }

  @Test
  fun anAppIsSavedByPackageNameWithOneOfItsCertificates() {
    val fields = listOf(box(0, listOf("username")), box(1, listOf("password")))
    val save = capture(fields, listOf("bob", "pw"))!!
    assertEquals(SaveKind.APP, save.kind)
    assertEquals("com.example.app", save.packageName)
    assertEquals("AAAA", save.certSha256) // the first in sorted order: always the same choice
    assertEquals("Example App", save.label)
    assertNull(save.host)
  }

  @Test
  fun aClaimedWebAddressInAnOrdinaryAppIsIgnored() {
    // A hostile app says its boxes belong to bank.com. It is saved as that APP, never as bank.com.
    val save = capture(webForm, listOf("alice", "pw"), trustedBrowser = false, pkg = "com.evil.app")!!
    assertEquals(SaveKind.APP, save.kind)
    assertEquals("com.evil.app", save.packageName)
    assertNull(save.host)
  }

  @Test
  fun anAppWhoseCertificateCannotBeReadIsNotSaved() {
    val fields = listOf(box(0, listOf("username")), box(1, listOf("password")))
    assertNull(capture(fields, listOf("bob", "pw"), certs = null))
    assertNull(capture(fields, listOf("bob", "pw"), certs = AppCertificates(emptySet(), emptySet())))
  }

  @Test
  fun absurdlyLongTextIsNotSaved() {
    assertNull(capture(webForm, listOf("alice", "x".repeat(1025)), trustedBrowser = true))
    assertNull(capture(webForm, listOf("u".repeat(513), "pw"), trustedBrowser = true))
    assertNotNull(capture(webForm, listOf("alice", "x".repeat(1024)), trustedBrowser = true))
  }

  @Test
  fun theUsernameIsTrimmed() {
    val save = capture(webForm, listOf("  alice  ", "pw"), trustedBrowser = true)!!
    assertEquals("alice", save.username)
  }

  @Test
  fun aFormThatIsAlreadyGoneIsStillSavedWhenNothingElseIsThere() {
    // After a submit the page may be hidden by the time Android asks.
    val gone =
      listOf(
        box(0, listOf("username"), "bank.com", "https", usable = false),
        box(1, listOf("password"), "bank.com", "https", usable = false),
      )
    assertNotNull(capture(gone, listOf("alice", "pw"), trustedBrowser = true))
  }

  @Test
  fun aVisiblePasswordBoxIsPreferredOverAHiddenOne() {
    val fields =
      listOf(
        box(0, listOf("username"), "bank.com", "https"),
        box(1, listOf("password"), "bank.com", "https", usable = false),
        box(2, listOf("password"), "bank.com", "https"),
      )
    val save = capture(fields, listOf("alice", "hidden-value", "real-value"), trustedBrowser = true)!!
    assertEquals("real-value", save.password)
  }

  @Test
  fun aSuggestedPasswordIsNotedForTheWebsiteWithNoUserNameYet() {
    val note =
      SaveCapture.forSuggestion(Origin.Web("shop.example.com"), "Abc!1234xyz", { "App" }, { null })!!
    assertEquals(SaveKind.WEB, note.kind)
    assertEquals("", note.username)
    assertEquals("Abc!1234xyz", note.password)
    assertEquals("shop.example.com", note.host)
    assertNull(note.packageName)
  }

  @Test
  fun aSuggestedPasswordForAnAppNeedsTheAppsCertificate() {
    val certs = AppCertificates(setOf("BBBB", "AAAA"), setOf("BBBB", "AAAA"))
    val note =
      SaveCapture.forSuggestion(Origin.App("com.example.app"), "pw-123456", { "Example App" }, { certs })!!
    assertEquals(SaveKind.APP, note.kind)
    assertEquals("com.example.app", note.packageName)
    assertEquals("Example App", note.label)
    assertEquals("AAAA", note.certSha256)
    // Without a certificate a later fill could not be matched safely, so nothing is kept.
    assertNull(SaveCapture.forSuggestion(Origin.App("com.example.app"), "pw-123456", { "x" }, { null }))
  }

  @Test
  fun anEmptyOrHugeSuggestedPasswordIsNeverKept() {
    assertNull(SaveCapture.forSuggestion(Origin.Web("a.com"), "", { null }, { null }))
    assertNull(SaveCapture.forSuggestion(Origin.Web("a.com"), "x".repeat(2000), { null }, { null }))
  }
}
