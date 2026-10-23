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
 *
 * Each password box also gets a ROLE: a box for a password that already exists ([Role.CURRENT]),
 * or a box where a NEW password is chosen ([Role.NEW]: a sign-up, or a change-password form).
 * A page that marks its boxes (the `new-password` hint) is believed. Many pages do not, so for
 * unmarked boxes there is a careful guess, only when there are TWO or more visible password
 * boxes (a single box is always taken as a sign-in): see [rolesOf].
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

  // Words in a box's own name or label. Only used to tell apart unmarked password boxes.
  private val CURRENT_WORDS = listOf("current", "old", "existing", "previous")
  private val CONFIRM_WORDS = listOf("confirm", "repeat", "retype", "re-enter", "reenter", "verify", "again")
  private val NEW_PHRASES =
    listOf("new password", "new-password", "newpassword", "create password", "create a password", "choose a password", "choose password", "set password", "set a password")

  /** What a password box is for. */
  enum class Role { CURRENT, NEW }

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

  /** The page or app clearly says this box is for a NEW password. */
  private fun isMarkedNew(f: FieldNode) =
    hasHint(f, HINT_NEW_PASSWORD) || f.htmlAutocomplete.equals("new-password", true)

  /** A box for a password that already exists ("current-password"), marked or not. */
  private fun isCurrentPassword(f: FieldNode): Boolean {
    if (isMarkedNew(f)) return false
    return hasHint(f, HINT_PASSWORD) ||
      f.htmlType.equals("password", true) ||
      f.htmlAutocomplete.equals("current-password", true) ||
      isPasswordInput(f)
  }

  private fun isMarkedCurrent(f: FieldNode) =
    hasHint(f, HINT_PASSWORD) || f.htmlAutocomplete.equals("current-password", true)

  private fun isAnyPassword(f: FieldNode) = isCurrentPassword(f) || isMarkedNew(f)

  private fun labelHas(f: FieldNode, words: List<String>) = words.any { f.label.contains(it) }

  /**
   * The role of every password box in [boxes] (which must all be password boxes), by index.
   *
   *  1. A box the page marks is believed: `new-password` is NEW, `current-password` is CURRENT.
   *  2. An unmarked box that comes after a marked NEW box is the "confirm" box of that form: NEW.
   *     One that comes before it is the old password: CURRENT.
   *  3. Otherwise, with no marked NEW box on the page, unmarked boxes are guessed, but only when
   *     there are two or more password boxes (one box is a sign-in, always):
   *       - a box named like "current", "old" or "existing" is CURRENT, the others NEW;
   *       - otherwise two boxes are a sign-up with a "confirm" box (both NEW), and three or more
   *         are a change-password form (the first is CURRENT, the rest NEW).
   *     A single box named like "new password" or "create a password" is NEW.
   */
  fun rolesOf(boxes: List<FieldNode>): Map<Int, Role> {
    val sorted = boxes.sortedBy { it.index }
    val roles = HashMap<Int, Role>()
    for (b in sorted) {
      if (isMarkedNew(b)) roles[b.index] = Role.NEW else if (isMarkedCurrent(b)) roles[b.index] = Role.CURRENT
    }
    val unmarked = sorted.filter { it.index !in roles }
    if (unmarked.isEmpty()) return roles

    val markedNew = sorted.filter { roles[it.index] == Role.NEW }
    if (markedNew.isNotEmpty()) {
      val firstNew = markedNew.first().index
      for (b in unmarked) roles[b.index] = if (b.index > firstNew) Role.NEW else Role.CURRENT
      return roles
    }

    // No box is marked NEW. One box is a sign-in unless its own name says it is a new password.
    if (sorted.size == 1) {
      val only = unmarked.single()
      roles[only.index] = if (NEW_PHRASES.any { only.label.contains(it) }) Role.NEW else Role.CURRENT
      return roles
    }

    val named = unmarked.filter { labelHas(it, CURRENT_WORDS) }
    if (named.isNotEmpty() || roles.containsValue(Role.CURRENT)) {
      for (b in unmarked) roles[b.index] = if (b in named) Role.CURRENT else Role.NEW
      return roles
    }
    // Nothing is marked and nothing is named: two boxes are a sign-up with a "confirm" box (both
    // NEW); three or more are a change-password form, where the first one holds the old password.
    for ((i, b) in unmarked.withIndex()) {
      roles[b.index] = if (sorted.size >= 3 && i == 0) Role.CURRENT else Role.NEW
    }
    return roles
  }

  /** The roles of the visible password boxes on a screen. */
  private fun visibleRoles(fields: List<FieldNode>): Map<Int, Role> =
    rolesOf(fields.filter { it.isUsable && isAnyPassword(it) })

  private fun looksLikeUsername(f: FieldNode): Boolean =
    hasHint(f, HINT_USERNAME) ||
      hasHint(f, HINT_EMAIL) ||
      f.htmlAutocomplete.equals("username", true) ||
      f.htmlAutocomplete.equals("email", true) ||
      f.htmlType.equals("email", true) ||
      ((f.inputType and CLASS_MASK) == CLASS_TEXT &&
        (variation(f) == TEXT_VARIATION_EMAIL || variation(f) == TEXT_VARIATION_WEB_EMAIL))

  /** The page or app clearly says this box is a user name (not just an e-mail box). */
  private fun isMarkedUsername(f: FieldNode): Boolean =
    hasHint(f, HINT_USERNAME) || f.htmlAutocomplete.equals("username", true)

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
   * Finds the login form, or null if there is nothing to fill here.
   *
   * Null is returned for sign-up forms (boxes for a NEW password only), for screens with several
   * current-password boxes and no focus on one of them, and when no password box is usable.
   *
   * On a change-password form (a current box and new boxes) the current box is filled only when
   * it is the one that was tapped; tapping a new box gets the strong-password suggestion instead.
   */
  fun findLoginForm(fields: List<FieldNode>): LoginForm? {
    val usable = fields.filter { it.isUsable }
    val roles = visibleRoles(fields)
    val currents = usable.filter { roles[it.index] == Role.CURRENT }
    if (currents.isEmpty()) return null
    val hasNewBox = roles.values.any { it == Role.NEW }
    val password =
      when {
        hasNewBox -> currents.firstOrNull { it.isFocused } ?: return null
        currents.size == 1 -> currents[0]
        else -> currents.firstOrNull { it.isFocused } ?: return null
      }
    return LoginForm(password, pickUsername(usable, password))
  }

  /** The user name is a box on the same web page that comes before the password box. */
  private fun pickUsername(usable: List<FieldNode>, password: FieldNode): FieldNode? {
    val before = usable.filter { it.index < password.index && it.webDomain == password.webDomain }
    return before.lastOrNull { looksLikeUsername(it) } ?: before.lastOrNull { isPlainText(it) }
  }

  /**
   * The user-name box of a sign-in that is split over two pages (the user name first, the password
   * on the next page, as Google and Microsoft do), or null.
   *
   * It is deliberately strict: the page must have NO password box, and the box must be explicitly
   * marked as a user name (`username` hint or `autocomplete="username"`). An ordinary e-mail box
   * (a newsletter form, say) is never offered. The password page that follows is the normal case.
   */
  fun findUsernameStep(fields: List<FieldNode>): FieldNode? {
    val usable = fields.filter { it.isUsable }
    if (usable.any { isAnyPassword(it) }) return null
    val marked = usable.filter { isMarkedUsername(it) }
    return marked.firstOrNull { it.isFocused } ?: marked.singleOrNull()
  }

  /**
   * The visible boxes meant for a NEW password: the new box of a sign-up or change-password form
   * and its "confirm" box. Only these are filled when KiteVault suggests a strong password. A
   * box that is hidden, disabled or has no size never counts (an invisible box is a classic trick
   * to steal a filled-in password).
   */
  fun findNewPasswordBoxes(fields: List<FieldNode>): List<FieldNode> {
    val roles = visibleRoles(fields)
    return fields.filter { it.isUsable && roles[it.index] == Role.NEW }
  }

  /** True when the visible boxes include one for a NEW password (a sign-up or change-password page). */
  fun hasNewPasswordBox(fields: List<FieldNode>): Boolean = findNewPasswordBoxes(fields).isNotEmpty()

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

    val roles = rolesOf(passwords)
    val wanted = passwords.filter { roles[it.index] == Role.NEW }.ifEmpty { passwords }
    val password: FieldNode
    if (values == null) {
      // Nothing typed yet: several current-password boxes need focus to pick one.
      val focused = wanted.firstOrNull { it.isFocused }
      if (focused == null && wanted.size > 1 && !wanted.all { roles[it.index] == Role.NEW }) return null
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
