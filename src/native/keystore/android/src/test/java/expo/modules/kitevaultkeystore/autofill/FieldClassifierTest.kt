package expo.modules.kitevaultkeystore.autofill

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class FieldClassifierTest {
  private val textInput = 0x1
  private val passwordInput = 0x1 or 0x80
  private val emailInput = 0x1 or 0x20

  private class Builder(val index: Int) {
    var hints = emptyList<String>()
    var htmlType: String? = null
    var autocomplete: String? = null
    var inputType = 0
    var focused = false
    var usable = true
    var domain: String? = null

    fun build() =
      FieldNode(index, hints, htmlType, autocomplete, inputType, focused, usable, domain, null)
  }

  private fun f(index: Int, init: Builder.() -> Unit = {}): FieldNode =
    Builder(index).apply(init).build()

  @Test
  fun findsPasswordAndUsernameFromHints() {
    val form =
      FieldClassifier.findLoginForm(
        listOf(f(0) { hints = listOf("username") }, f(1) { hints = listOf("password") })
      )
    assertNotNull(form)
    assertEquals(1, form!!.password.index)
    assertEquals(0, form.username!!.index)
  }

  @Test
  fun findsFieldsFromWebPageAttributes() {
    val form =
      FieldClassifier.findLoginForm(
        listOf(
          f(0) { htmlType = "email"; domain = "a.com" },
          f(1) { htmlType = "password"; domain = "a.com" },
        )
      )
    assertEquals(1, form!!.password.index)
    assertEquals(0, form.username!!.index)
    val byAutocomplete =
      FieldClassifier.findLoginForm(
        listOf(
          f(0) { htmlType = "text"; autocomplete = "username"; domain = "a.com" },
          f(1) { htmlType = "text"; autocomplete = "current-password"; domain = "a.com" },
        )
      )
    assertEquals(1, byAutocomplete!!.password.index)
    assertEquals(0, byAutocomplete.username!!.index)
  }

  @Test
  fun findsFieldsFromInputTypeWhenThereAreNoHints() {
    val form =
      FieldClassifier.findLoginForm(
        listOf(f(0) { inputType = emailInput }, f(1) { inputType = passwordInput })
      )
    assertEquals(1, form!!.password.index)
    assertEquals(0, form.username!!.index)
  }

  @Test
  fun usesPositionOnlyAsALastResort() {
    val form =
      FieldClassifier.findLoginForm(
        listOf(
          f(0) { inputType = textInput },
          f(1) { inputType = textInput },
          f(2) { inputType = passwordInput },
        )
      )
    assertEquals(1, form!!.username!!.index) // the text box right before the password
  }

  @Test
  fun aUsernameAfterThePasswordIsIgnored() {
    val form =
      FieldClassifier.findLoginForm(
        listOf(f(0) { inputType = passwordInput }, f(1) { hints = listOf("username") })
      )
    assertNull(form!!.username)
  }

  @Test
  fun aPasswordOnlyScreenStillCounts() {
    val form = FieldClassifier.findLoginForm(listOf(f(0) { inputType = passwordInput }))
    assertNull(form!!.username)
  }

  @Test
  fun noPasswordBoxMeansNoForm() {
    assertNull(FieldClassifier.findLoginForm(listOf(f(0) { hints = listOf("username") })))
    assertNull(FieldClassifier.findLoginForm(emptyList()))
  }

  @Test
  fun invisibleOrDisabledBoxesAreNeverUsed() {
    val form =
      FieldClassifier.findLoginForm(
        listOf(
          f(0) { hints = listOf("username"); usable = false },
          f(1) { hints = listOf("password"); usable = false },
        )
      )
    assertNull(form)
    // A hidden password box next to a visible one is not chosen either.
    val mixed =
      FieldClassifier.findLoginForm(
        listOf(
          f(0) { hints = listOf("username") },
          f(1) { hints = listOf("password"); usable = false },
          f(2) { hints = listOf("password") },
        )
      )
    assertEquals(2, mixed!!.password.index)
  }

  @Test
  fun signUpFormsAreNotFilled() {
    val signUp =
      FieldClassifier.findLoginForm(
        listOf(f(0) { hints = listOf("username") }, f(1) { hints = listOf("newPassword") })
      )
    assertNull(signUp)
    val withBoth =
      FieldClassifier.findLoginForm(
        listOf(f(0) { hints = listOf("password") }, f(1) { hints = listOf("newPassword") })
      )
    assertNull(withBoth)
    val web =
      FieldClassifier.findLoginForm(
        listOf(f(0) { htmlType = "password"; autocomplete = "new-password" })
      )
    assertNull(web)
  }

  @Test
  fun severalPasswordBoxesNeedFocusToChooseOne() {
    val none =
      FieldClassifier.findLoginForm(
        listOf(f(0) { hints = listOf("password") }, f(1) { hints = listOf("password") })
      )
    assertNull(none)
    val focused =
      FieldClassifier.findLoginForm(
        listOf(
          f(0) { hints = listOf("password") },
          f(1) { hints = listOf("password"); focused = true },
        )
      )
    assertEquals(1, focused!!.password.index)
  }

  @Test
  fun aUsernameFromAnotherWebSiteIsNotUsed() {
    val form =
      FieldClassifier.findLoginForm(
        listOf(
          f(0) { hints = listOf("username"); domain = "evil.test" },
          f(1) { hints = listOf("password"); domain = "bank.com" },
        )
      )
    assertNull(form!!.username)
  }

  @Test
  fun numberPinBoxesMarkedAsPasswordCount() {
    val form = FieldClassifier.findLoginForm(listOf(f(0) { inputType = 0x2 or 0x10 }))
    assertNotNull(form)
  }

  // --- the form to offer to save ---

  @Test
  fun saveFormAcceptsSignInSignUpAndChangePassword() {
    val signIn = FieldClassifier.findSaveForm(listOf(f(0) { hints = listOf("username") }, f(1) { hints = listOf("password") }))
    assertEquals(1, signIn!!.password.index)
    val signUp =
      FieldClassifier.findSaveForm(
        listOf(f(0) { hints = listOf("username") }, f(1) { hints = listOf("newPassword") }, f(2) { hints = listOf("newPassword") })
      )
    assertEquals(1, signUp!!.password.index)
    assertEquals(0, signUp.username!!.index)
    val change =
      FieldClassifier.findSaveForm(listOf(f(0) { hints = listOf("password") }, f(1) { hints = listOf("newPassword") }))
    assertEquals(1, change!!.password.index) // the NEW password is the one to save
  }

  @Test
  fun saveFormNeedsAPasswordBox() {
    assertNull(FieldClassifier.findSaveForm(listOf(f(0) { hints = listOf("username") })))
    assertNull(FieldClassifier.findSaveForm(emptyList()))
  }

  @Test
  fun saveFormWithTypedValuesUsesTheBoxThatHasText() {
    val fields = listOf(f(0) { hints = listOf("password") }, f(1) { hints = listOf("newPassword") })
    assertEquals(1, FieldClassifier.findSaveForm(fields, listOf("old", "new"))!!.password.index)
    assertEquals(1, FieldClassifier.findSaveForm(fields, listOf(null, "new"))!!.password.index)
    assertNull(FieldClassifier.findSaveForm(fields, listOf("old", "")))
    assertNull(FieldClassifier.findSaveForm(fields, listOf(null, null)))
  }

  @Test
  fun saveFormRefusesPasswordsThatDisagree() {
    val fields = listOf(f(0) { hints = listOf("newPassword") }, f(1) { hints = listOf("newPassword") })
    assertNull(FieldClassifier.findSaveForm(fields, listOf("abc", "abd")))
    assertEquals(0, FieldClassifier.findSaveForm(fields, listOf("abc", "abc"))!!.password.index)
  }

  @Test
  fun saveFormWithSeveralCurrentPasswordsNeedsFocusBeforeAnythingIsTyped() {
    val fields = listOf(f(0) { hints = listOf("password") }, f(1) { hints = listOf("password") })
    assertNull(FieldClassifier.findSaveForm(fields))
    val focused = listOf(f(0) { hints = listOf("password") }, f(1) { hints = listOf("password"); focused = true })
    assertEquals(1, FieldClassifier.findSaveForm(focused)!!.password.index)
  }

  @Test
  fun saveFormPrefersVisibleBoxesButFallsBackToHiddenOnes() {
    val hiddenOnly = listOf(f(0) { hints = listOf("password"); usable = false })
    assertNotNull(FieldClassifier.findSaveForm(hiddenOnly))
    val both = listOf(f(0) { hints = listOf("password"); usable = false }, f(1) { hints = listOf("password") })
    assertEquals(1, FieldClassifier.findSaveForm(both)!!.password.index)
  }

  @Test
  fun signUpIsStillNotAFillForm() {
    // Filling and saving are different questions: a sign-up form is saved but never filled.
    val fields = listOf(f(0) { hints = listOf("username") }, f(1) { hints = listOf("newPassword") })
    assertNull(FieldClassifier.findLoginForm(fields))
    assertNotNull(FieldClassifier.findSaveForm(fields))
  }
}
