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
    var label = ""

    fun build() =
      FieldNode(index, hints, htmlType, autocomplete, inputType, focused, usable, domain, null, label)
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

  @Test
  fun newPasswordBoxesAreTheVisibleOnesMarkedAsNew() {
    val fields =
      listOf(
        f(0) { hints = listOf("username") },
        f(1) { hints = listOf("newPassword") },
        f(2) { hints = listOf("newPassword") }, // the "confirm" box
        f(3) { hints = listOf("newPassword"); usable = false }, // hidden: never filled
      )
    assertEquals(listOf(1, 2), FieldClassifier.findNewPasswordBoxes(fields).map { it.index })
  }

  @Test
  fun aWebPageMarkedNewPasswordCountsToo() {
    val fields = listOf(f(0) { autocomplete = "new-password"; htmlType = "password" })
    assertEquals(listOf(0), FieldClassifier.findNewPasswordBoxes(fields).map { it.index })
  }

  @Test
  fun aBoxTheSiteMarksAsCurrentIsNeverANewPasswordBox() {
    val fields =
      listOf(
        f(0) { hints = listOf("password") },
        f(1) { htmlType = "password"; autocomplete = "current-password" },
      )
    assertEquals(emptyList<FieldNode>(), FieldClassifier.findNewPasswordBoxes(fields))
  }

  @Test
  fun aSinglePasswordBoxThatIsNotMarkedIsAlwaysASignIn() {
    for (box in listOf(f(0) { inputType = passwordInput }, f(0) { htmlType = "password" })) {
      assertEquals(emptyList<FieldNode>(), FieldClassifier.findNewPasswordBoxes(listOf(box)))
      assertNotNull(FieldClassifier.findLoginForm(listOf(box)))
    }
  }

  @Test
  fun aSignInFormHasNoNewPasswordBoxes() {
    val fields = listOf(f(0) { hints = listOf("username") }, f(1) { hints = listOf("password") })
    assertEquals(emptyList<FieldNode>(), FieldClassifier.findNewPasswordBoxes(fields))
    assertNotNull(FieldClassifier.findLoginForm(fields))
  }

  @Test
  fun aSignUpFormGetsASuggestionBoxButStillNoFill() {
    val fields = listOf(f(0) { hints = listOf("emailAddress") }, f(1) { hints = listOf("newPassword") })
    assertNull(FieldClassifier.findLoginForm(fields))
    assertEquals(listOf(1), FieldClassifier.findNewPasswordBoxes(fields).map { it.index })
  }

  // --- Pages that do not mark their boxes: a careful guess, only with two or more password boxes

  @Test
  fun twoUnmarkedPasswordBoxesAreASignUpWithAConfirmBox() {
    val fields =
      listOf(f(0) { hints = listOf("emailAddress") }, f(1) { inputType = passwordInput }, f(2) { inputType = passwordInput })
    assertEquals(listOf(1, 2), FieldClassifier.findNewPasswordBoxes(fields).map { it.index })
    assertNull(FieldClassifier.findLoginForm(fields))
    // Both boxes are saved as one new password.
    assertEquals(1, FieldClassifier.findSaveForm(fields)!!.password.index)
  }

  @Test
  fun twoBoxesWhereOneIsCalledCurrentOrOldAreAChangePassword() {
    val fields =
      listOf(
        f(0) { inputType = passwordInput; label = "current password" },
        f(1) { inputType = passwordInput; label = "new password" },
      )
    assertEquals(listOf(1), FieldClassifier.findNewPasswordBoxes(fields).map { it.index })
    val old = listOf(f(0) { inputType = passwordInput; label = "old_pass" }, f(1) { inputType = passwordInput })
    assertEquals(listOf(1), FieldClassifier.findNewPasswordBoxes(old).map { it.index })
    // The old password is never the one that is saved.
    assertEquals(1, FieldClassifier.findSaveForm(fields)!!.password.index)
  }

  @Test
  fun threeUnmarkedBoxesAreChangePasswordWithTheFirstOneHoldingTheOldPassword() {
    val fields = List(3) { i -> f(i) { inputType = passwordInput } }
    assertEquals(listOf(1, 2), FieldClassifier.findNewPasswordBoxes(fields).map { it.index })
  }

  @Test
  fun onAChangePasswordPageTheCurrentBoxIsFilledOnlyWhenItIsTheOneTapped() {
    val notTapped =
      listOf(f(0) { inputType = passwordInput; label = "current" }, f(1) { inputType = passwordInput })
    assertNull(FieldClassifier.findLoginForm(notTapped))
    val tapped =
      listOf(f(0) { inputType = passwordInput; label = "current"; focused = true }, f(1) { inputType = passwordInput })
    assertEquals(0, FieldClassifier.findLoginForm(tapped)!!.password.index)
    // Tapping the new box fills nothing: it gets the strong-password suggestion instead.
    val newTapped =
      listOf(f(0) { inputType = passwordInput; label = "current" }, f(1) { inputType = passwordInput; focused = true })
    assertNull(FieldClassifier.findLoginForm(newTapped))
    assertEquals(listOf(1), FieldClassifier.findNewPasswordBoxes(newTapped).map { it.index })
  }

  @Test
  fun markedBoxesAreBelievedOverAnyGuess() {
    // The page says the second box is for the current password: it stays one, whatever its name.
    val fields =
      listOf(
        f(0) { hints = listOf("newPassword"); label = "x" },
        f(1) { hints = listOf("password"); label = "confirm password" },
      )
    assertEquals(listOf(0), FieldClassifier.findNewPasswordBoxes(fields).map { it.index })
  }

  @Test
  fun anUnmarkedConfirmBoxAfterAMarkedNewBoxIsFilledToo() {
    val fields = listOf(f(0) { hints = listOf("newPassword") }, f(1) { inputType = passwordInput })
    assertEquals(listOf(0, 1), FieldClassifier.findNewPasswordBoxes(fields).map { it.index })
  }

  @Test
  fun anUnmarkedBoxBeforeAMarkedNewBoxHoldsTheOldPassword() {
    val fields = listOf(f(0) { inputType = passwordInput }, f(1) { hints = listOf("newPassword") })
    assertEquals(listOf(1), FieldClassifier.findNewPasswordBoxes(fields).map { it.index })
  }

  @Test
  fun aSingleBoxNamedLikeANewPasswordIsANewPassword() {
    val named = listOf(f(0) { inputType = passwordInput; label = "create a password" })
    assertEquals(listOf(0), FieldClassifier.findNewPasswordBoxes(named).map { it.index })
    // But an ordinary name is a sign-in.
    val plain = listOf(f(0) { inputType = passwordInput; label = "enter your password" })
    assertEquals(emptyList<FieldNode>(), FieldClassifier.findNewPasswordBoxes(plain))
  }

  @Test
  fun hiddenPasswordBoxesDoNotMakeAPageASignUp() {
    // A login page that also carries a hidden second password box is still a login page.
    val fields = listOf(f(0) { inputType = passwordInput }, f(1) { inputType = passwordInput; usable = false })
    assertEquals(emptyList<FieldNode>(), FieldClassifier.findNewPasswordBoxes(fields))
    assertNotNull(FieldClassifier.findLoginForm(fields))
  }

  @Test
  fun twoSignInBoxesMarkedCurrentStayASignIn() {
    val fields = listOf(f(0) { hints = listOf("password"); focused = true }, f(1) { hints = listOf("password") })
    assertEquals(emptyList<FieldNode>(), FieldClassifier.findNewPasswordBoxes(fields))
    assertEquals(0, FieldClassifier.findLoginForm(fields)!!.password.index)
  }

  @Test
  fun rolesOfIsStableForAnyOrderOfTheList() {
    val a = f(0) { inputType = passwordInput }
    val b = f(1) { inputType = passwordInput }
    assertEquals(FieldClassifier.rolesOf(listOf(a, b)), FieldClassifier.rolesOf(listOf(b, a)))
  }

  // --- The first page of a two-page sign-in: only a user name

  @Test
  fun aPageWithOnlyAMarkedUserNameIsTheFirstStepOfASignIn() {
    val byHint = listOf(f(0) { hints = listOf("username") })
    assertEquals(0, FieldClassifier.findUsernameStep(byHint)!!.index)
    val byAutocomplete = listOf(f(0) { autocomplete = "username"; htmlType = "email" })
    assertEquals(0, FieldClassifier.findUsernameStep(byAutocomplete)!!.index)
  }

  @Test
  fun anOrdinaryEmailBoxIsNeverOffered() {
    // A newsletter or contact form: an e-mail box with no "username" mark.
    assertNull(FieldClassifier.findUsernameStep(listOf(f(0) { htmlType = "email" })))
    assertNull(FieldClassifier.findUsernameStep(listOf(f(0) { hints = listOf("emailAddress") })))
    assertNull(FieldClassifier.findUsernameStep(listOf(f(0) { inputType = emailInput })))
  }

  @Test
  fun theUserNameStepNeedsAPageWithNoPasswordBoxAtAll() {
    val withPassword = listOf(f(0) { hints = listOf("username") }, f(1) { hints = listOf("password") })
    assertNull(FieldClassifier.findUsernameStep(withPassword))
    val hiddenPassword = listOf(f(0) { hints = listOf("username") }, f(1) { hints = listOf("password"); usable = false })
    assertEquals(0, FieldClassifier.findUsernameStep(hiddenPassword)!!.index)
  }

  @Test
  fun theUserNameStepNeedsAVisibleBoxAndTheTappedOneWinsWhenThereAreSeveral() {
    assertNull(FieldClassifier.findUsernameStep(listOf(f(0) { hints = listOf("username"); usable = false })))
    val two = listOf(f(0) { hints = listOf("username") }, f(1) { hints = listOf("username"); focused = true })
    assertEquals(1, FieldClassifier.findUsernameStep(two)!!.index)
    val unclear = listOf(f(0) { hints = listOf("username") }, f(1) { hints = listOf("username") })
    assertNull(FieldClassifier.findUsernameStep(unclear))
    assertNull(FieldClassifier.findUsernameStep(emptyList()))
  }

  @Test
  fun aPasswordOnlyPageIsStillTheNormalSecondStep() {
    val form = FieldClassifier.findLoginForm(listOf(f(0) { hints = listOf("password") }))!!
    assertEquals(0, form.password.index)
    assertNull(form.username)
  }
}
