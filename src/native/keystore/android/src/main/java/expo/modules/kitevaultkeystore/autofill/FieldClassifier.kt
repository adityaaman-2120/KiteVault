package expo.modules.kitevaultkeystore.autofill

/** The boxes of one login form that we will fill. */
internal data class LoginForm(val password: FieldNode, val username: FieldNode?)

/**
 * Looks at the text boxes on a screen and finds the login form.
 *
 * In simple words: it answers "is there a password box here, and which box next to it is for the
 * user name?". It only trusts boxes that are really visible and usable (an invisible box is a
 * classic trick to steal a filled-in password). It prefers clear hints from the app or web page,
 * and only as a last resort uses the position (the text box just before the password box).
 * It never guesses from words like "login" in an internal name.
 */
internal object FieldClassifier {
  // Values of android.text.InputType, copied here so this class needs no Android classes.
  private const val CLASS_MASK = 0x0000000f
  private const val VARIATION_MASK = 0x00000ff0
  private const val CLASS_TEXT = 0x1
  private const val CLASS_NUMBER = 0x2
  private const val TEXT_VARIATION_PASSWORD = 0x80
  private const val TEXT_VARIATION_VISIBLE_PASSWORD = 0x90
  private const val TEXT_VARIATION_WEB_PASSWORD = 0xe0
  private const val TEXT_VARIATION_EMAIL = 0x20
  private const val TEXT_VARIATION_WEB_EMAIL = 0xd0
  private const val NUMBER_VARIATION_PASSWORD = 0x10

  // Values of View.AUTOFILL_HINT_*.
  private const val HINT_PASSWORD = "password"
  private const val HINT_NEW_PASSWORD = "newPassword"
  private const val HINT_USERNAME = "username"
  private const val HINT_EMAIL = "emailAddress"

  private fun hasHint(f: FieldNode, hint: String) =
    f.autofillHints.any { it.equals(hint, ignoreCase = true) }

  private fun variation(f: FieldNode) = f.inputType and VARIATION_MASK

  private fun isPasswordInput(f: FieldNode): Boolean {
    val cls = f.inputType and CLASS_MASK
    val v = variation(f)
    return (cls == CLASS_TEXT &&
      (v == TEXT_VARIATION_PASSWORD ||
        v == TEXT_VARIATION_VISIBLE_PASSWORD ||
        v == TEXT_VARIATION_WEB_PASSWORD)) || (cls == CLASS_NUMBER && v == NUMBER_VARIATION_PASSWORD)
  }

  /** A box for a password that already exists ("current-password"). */
  private fun isCurrentPassword(f: FieldNode): Boolean {
    if (hasHint(f, HINT_NEW_PASSWORD) || f.htmlAutocomplete.equals("new-password", true)) {
      return false
    }
    return hasHint(f, HINT_PASSWORD) ||
      f.htmlType.equals("password", true) ||
      f.htmlAutocomplete.equals("current-password", true) ||
      isPasswordInput(f)
  }

  private fun isAnyPassword(f: FieldNode) =
    isCurrentPassword(f) ||
      hasHint(f, HINT_NEW_PASSWORD) ||
      f.htmlAutocomplete.equals("new-password", true)

  private fun looksLikeUsername(f: FieldNode): Boolean =
    hasHint(f, HINT_USERNAME) ||
      hasHint(f, HINT_EMAIL) ||
      f.htmlAutocomplete.equals("username", true) ||
      f.htmlAutocomplete.equals("email", true) ||
      f.htmlType.equals("email", true) ||
      ((f.inputType and CLASS_MASK) == CLASS_TEXT &&
        (variation(f) == TEXT_VARIATION_EMAIL || variation(f) == TEXT_VARIATION_WEB_EMAIL))

  /** An ordinary text box that could hold a user name when nothing better is known. */
  private fun isPlainText(f: FieldNode): Boolean {
    if (isAnyPassword(f)) return false
    if (f.htmlType != null) {
      return f.htmlType.equals("text", true) || f.htmlType.equals("email", true) ||
        f.htmlType.equals("tel", true) || f.htmlType.isEmpty()
    }
    return (f.inputType and CLASS_MASK) == CLASS_TEXT || f.inputType == 0
  }

  /**
   * Finds the login form, or null if this screen is not a plain sign-in form.
   *
   * Null is also returned for sign-up forms (boxes marked as a NEW password), for screens with
   * several password boxes and no focus on one of them, and when no password box is usable.
   */
  fun findLoginForm(fields: List<FieldNode>): LoginForm? {
    val usable = fields.filter { it.isUsable }
    val passwords = usable.filter { isCurrentPassword(it) }
    if (passwords.isEmpty()) return null
    // A form with a "new password" box is a sign-up or change-password form: not for filling.
    if (usable.any { hasHint(it, HINT_NEW_PASSWORD) || it.htmlAutocomplete.equals("new-password", true) }) {
      return null
    }
    val password =
      when {
        passwords.size == 1 -> passwords[0]
        else -> passwords.firstOrNull { it.isFocused } ?: return null
      }

    return LoginForm(password, pickUsername(usable, password))
  }

  /** The user name is a box on the same web page that comes before the password box. */
  private fun pickUsername(usable: List<FieldNode>, password: FieldNode): FieldNode? {
    val before = usable.filter { it.index < password.index && it.webDomain == password.webDomain }
    return before.lastOrNull { looksLikeUsername(it) } ?: before.lastOrNull { isPlainText(it) }
  }

  private fun isNewPassword(f: FieldNode) =
    hasHint(f, HINT_NEW_PASSWORD) || f.htmlAutocomplete.equals("new-password", true)

  /**
   * Finds the form to OFFER TO SAVE: a sign-in form, a sign-up form or a change-password form.
   *
   * In simple words: this is the "save" twin of [findLoginForm]. A sign-up form is exactly the
   * case where saving matters, so a NEW password box is accepted here. If the form has a new
   * password box, that is the password to save (not the old one next to it).
   *
   * [values] are what the user typed, by box position. When it is null (at the time the form is
   * first shown, before anything is typed) only the shape of the form is looked at. When given,
   * the chosen password box must contain text, and two password boxes with different text (a typo
   * in the "confirm" box, or two different passwords) mean "do not save".
   *
   * Boxes that are not visible are used only if no visible password box exists: after a form is
   * submitted the page may already be gone when Android asks.
   */
  fun findSaveForm(fields: List<FieldNode>, values: List<String?>? = null): LoginForm? {
    val usableOnly = fields.filter { it.isUsable }
    val pool = if (usableOnly.any { isAnyPassword(it) }) usableOnly else fields
    val passwords = pool.filter { isAnyPassword(it) }
    if (passwords.isEmpty()) return null

    val wanted = passwords.filter { isNewPassword(it) }.ifEmpty { passwords }
    val password: FieldNode
    if (values == null) {
      // Nothing typed yet: several current-password boxes need focus to pick one.
      val focused = wanted.firstOrNull { it.isFocused }
      if (focused == null && wanted.size > 1 && !wanted.all { isNewPassword(it) }) return null
      password = focused ?: wanted.first()
    } else {
      val typed =
        wanted.map { it to values.getOrNull(it.index).orEmpty() }.filter { (_, text) -> text.isNotEmpty() }
      if (typed.isEmpty()) return null
      // "New password" and "confirm" must agree; two different passwords are not saved.
      if (typed.map { (_, text) -> text }.toSet().size > 1) return null
      password = typed.first().first
    }
    return LoginForm(password, pickUsername(pool, password))
  }
}
