package expo.modules.kitevaultkeystore.autofill

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Whole pages, as the autofill service sees them, and what KiteVault does on each. Each page is a
 * list of boxes like the ones a browser or an app reports. The four answers are the ones the
 * service combines into its response:
 *  - fill:     the sign-in boxes to fill after the unlock;
 *  - suggest:  the boxes that get a strong-password suggestion;
 *  - save:     the form to offer to save after it is submitted;
 *  - username: a page that has only a user name (the first step of a two-page sign-in).
 */
class FormScenariosTest {
  private val passwordInput = 0x1 or 0x80
  private val emailInput = 0x1 or 0x20

  private fun box(
    index: Int,
    hints: List<String> = emptyList(),
    type: String? = null,
    autocomplete: String? = null,
    inputType: Int = 0,
    focused: Boolean = false,
    usable: Boolean = true,
    label: String = "",
  ) =
    FieldNode(
      index = index,
      autofillHints = hints,
      htmlType = type,
      htmlAutocomplete = autocomplete,
      inputType = inputType,
      isFocused = focused,
      isUsable = usable,
      webDomain = "example.com",
      webScheme = "https",
      label = label,
    )

  private class Outcome(
    val fill: LoginForm?,
    val suggest: List<Int>,
    val save: LoginForm?,
    val username: Int?,
    val allowSuggest: Boolean,
  )

  private fun outcome(fields: List<FieldNode>) =
    Outcome(
      fill = FieldClassifier.findLoginForm(fields),
      suggest = FieldClassifier.findNewPasswordBoxes(fields).map { it.index },
      save = FieldClassifier.findSaveForm(fields),
      username = FieldClassifier.findUsernameStep(fields)?.index,
      // The service offers a strong password on a sign-in-looking page only when the page has no
      // box for a new password.
      allowSuggest = !FieldClassifier.hasNewPasswordBox(fields),
    )

  // --- Signing in -------------------------------------------------------------------------------

  @Test
  fun aNormalWebSignInIsFilledAndMayAlsoGetAStrongPasswordIfItTurnsOutToBeASignUp() {
    val page =
      listOf(
        box(0, type = "email", autocomplete = "username"),
        box(1, type = "password", autocomplete = "current-password"),
      )
    val o = outcome(page)
    assertEquals(1, o.fill!!.password.index)
    assertEquals(0, o.fill!!.username!!.index)
    assertEquals(emptyList<Int>(), o.suggest)
    assertTrue(o.allowSuggest)
    assertNotNull(o.save)
    assertNull(o.username)
  }

  @Test
  fun aNativeAppSignInIsFilled() {
    val page =
      listOf(
        box(0, hints = listOf("username"), inputType = 0x1),
        box(1, hints = listOf("password"), inputType = passwordInput),
      )
    val o = outcome(page)
    assertEquals(1, o.fill!!.password.index)
    assertEquals(0, o.fill!!.username!!.index)
    assertEquals(emptyList<Int>(), o.suggest)
  }

  @Test
  fun aSignInWithOneUnmarkedBoxIsNeverTakenForASignUp() {
    // The biggest risk of guessing is turning a sign-in into a sign-up. One box never is.
    val page = listOf(box(0, inputType = emailInput), box(1, inputType = passwordInput))
    val o = outcome(page)
    assertNotNull(o.fill)
    assertEquals(emptyList<Int>(), o.suggest)
  }

  // --- Signing in over two pages ----------------------------------------------------------------

  @Test
  fun theFirstPageOfATwoPageSignInFillsTheUserNameOnly() {
    val page = listOf(box(0, type = "email", autocomplete = "username", focused = true))
    val o = outcome(page)
    assertEquals(0, o.username)
    assertNull(o.fill)
    assertNull(o.save)
    assertEquals(emptyList<Int>(), o.suggest)
  }

  @Test
  fun theSecondPageWithOnlyAPasswordIsFilledAsUsual() {
    val page = listOf(box(0, type = "password", autocomplete = "current-password"))
    val o = outcome(page)
    assertEquals(0, o.fill!!.password.index)
    assertNull(o.fill!!.username)
    assertNull(o.username)
  }

  // --- Signing up -------------------------------------------------------------------------------

  @Test
  fun aSignUpThatMarksItsBoxesGetsTheSuggestionOnBothPasswordBoxes() {
    val page =
      listOf(
        box(0, type = "email", autocomplete = "email"),
        box(1, type = "password", autocomplete = "new-password"),
        box(2, type = "password", autocomplete = "new-password"),
      )
    val o = outcome(page)
    assertEquals(listOf(1, 2), o.suggest)
    assertNull(o.fill)
    assertEquals(1, o.save!!.password.index)
    assertEquals(0, o.save!!.username!!.index)
    assertEquals(false, o.allowSuggest)
  }

  @Test
  fun aSignUpThatDoesNotMarkItsBoxesButHasAConfirmBoxIsRecognisedAnyway() {
    val page =
      listOf(
        box(0, type = "email"),
        box(1, type = "password", label = "password"),
        box(2, type = "password", label = "confirm password"),
      )
    val o = outcome(page)
    assertEquals(listOf(1, 2), o.suggest)
    assertNull(o.fill)
    assertNotNull(o.save)
  }

  @Test
  fun aSignUpWithASingleUnmarkedBoxLooksLikeASignInAndIsOfferedTheStrongPasswordAfterTheUnlock() {
    val page = listOf(box(0, type = "email"), box(1, type = "password", label = "password"))
    val o = outcome(page)
    assertNotNull(o.fill)
    assertTrue(o.allowSuggest)
    assertEquals(emptyList<Int>(), o.suggest)
  }

  @Test
  fun aSignUpWithAHiddenSecondPasswordBoxIsStillASingleBoxPage() {
    val page =
      listOf(
        box(0, type = "password", label = "password"),
        box(1, type = "password", label = "honeypot", usable = false),
      )
    assertEquals(emptyList<Int>(), outcome(page).suggest)
    assertNotNull(outcome(page).fill)
  }

  // --- Changing a password ----------------------------------------------------------------------

  @Test
  fun aChangePasswordPageFillsTheOldPasswordOnlyWhenItsBoxIsTappedAndSuggestsForTheNewBoxes() {
    fun page(tapped: Int) =
      listOf(
        box(0, type = "password", autocomplete = "current-password", focused = tapped == 0),
        box(1, type = "password", autocomplete = "new-password", focused = tapped == 1),
        box(2, type = "password", autocomplete = "new-password", focused = tapped == 2),
      )
    val oldTapped = outcome(page(0))
    assertEquals(0, oldTapped.fill!!.password.index)
    assertEquals(false, oldTapped.allowSuggest) // never put a new password into the old box
    assertEquals(listOf(1, 2), oldTapped.suggest)

    val newTapped = outcome(page(1))
    assertNull(newTapped.fill)
    assertEquals(listOf(1, 2), newTapped.suggest)
    // What is saved is the new password, not the old one.
    assertEquals(1, newTapped.save!!.password.index)
  }

  @Test
  fun aChangePasswordPageThatMarksNothingIsRecognisedFromItsNames() {
    val page =
      listOf(
        box(0, type = "password", label = "current password", focused = true),
        box(1, type = "password", label = "new password"),
        box(2, type = "password", label = "confirm new password"),
      )
    val o = outcome(page)
    assertEquals(0, o.fill!!.password.index)
    assertEquals(listOf(1, 2), o.suggest)
    assertEquals(1, o.save!!.password.index)
  }

  // --- Pages with nothing to do -----------------------------------------------------------------

  @Test
  fun aNewsletterFormOrASearchBoxGetsNothing() {
    for (page in
      listOf(
        listOf(box(0, type = "email", autocomplete = "email")),
        listOf(box(0, inputType = emailInput)),
        listOf(box(0, type = "text"), box(1, type = "text")),
        emptyList(),
      )) {
      val o = outcome(page)
      assertNull(o.fill)
      assertNull(o.save)
      assertNull(o.username)
      assertEquals(emptyList<Int>(), o.suggest)
    }
  }

  @Test
  fun aPageWhoseOnlyBoxesAreHiddenGetsNothingToFillOrSuggest() {
    val page = listOf(box(0, type = "password", usable = false), box(1, type = "password", usable = false))
    val o = outcome(page)
    assertNull(o.fill)
    assertEquals(emptyList<Int>(), o.suggest)
    assertNull(o.username)
  }
}
