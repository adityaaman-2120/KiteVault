package expo.modules.kitevaultkeystore.autofill

/**
 * One text box on the screen that Android asked us to look at, reduced to plain facts.
 *
 * In simple words: Android describes the other app's screen with big, complicated objects. We copy
 * only what we need (is it a password box? is it visible? which website does it belong to?) into
 * this small class. Because it has no Android classes inside, we can test the rules that use it on
 * a normal computer.
 */
internal data class FieldNode(
  /** Position in the list. The service uses it to find the matching Android `AutofillId`. */
  val index: Int,
  /** Hints the app or the web page gave, such as "username" or "password". */
  val autofillHints: List<String> = emptyList(),
  /** For web pages: the type of the box, e.g. "password" or "email". */
  val htmlType: String? = null,
  /** For web pages: the `autocomplete` attribute, e.g. "username" or "current-password". */
  val htmlAutocomplete: String? = null,
  /** The Android `inputType` bit field of a normal app text box. */
  val inputType: Int = 0,
  val isFocused: Boolean = false,
  /** True only if the box and everything around it is shown, enabled and has a size. */
  val isUsable: Boolean = true,
  /** The web address host the browser says this box belongs to, if it is part of a web page. */
  val webDomain: String? = null,
  /** "https" or "http", if the browser said. */
  val webScheme: String? = null,
  /**
   * The box's own name in lower case: its hint, id and name, and the placeholder or label the page
   * gave it, joined with spaces. Only used to tell apart unmarked password boxes ("confirm",
   * "current"); it is never shown, saved or logged.
   */
  val label: String = "",
)

/** The whole screen: which app owns it and its text boxes, in the order they appear. */
internal data class ParsedScreen(
  val packageName: String,
  val fields: List<FieldNode>,
)
