package expo.modules.kitevaultkeystore.autofill

/**
 * The look of the screens KiteVault shows on top of other apps: colours and the small rules that
 * decide how things are drawn. It holds no Android classes, so every rule is unit tested on a
 * normal computer. [SheetUi] draws with it.
 *
 * The colours are the KiteVault palette (night blue, amber, coral), the same family the app uses.
 */
internal object AutofillStyle {
  // Surfaces
  const val SHEET = 0xFF121A3A.toInt()
  const val ROW = 0xFF1B2552.toInt()
  const val CHIP = 0xFF1E2A5A.toInt()
  const val FIELD = 0xFF080D20.toInt()
  const val HANDLE = 0xFF3A4575.toInt()

  // Text
  const val TEXT = 0xFFF4F5FA.toInt()
  const val MUTED = 0xFFB7BFDD.toInt()

  // Accents
  const val AMBER = 0xFFFFB547.toInt()
  const val ON_AMBER = 0xFF0E1630.toInt()
  const val CORAL = 0xFFFF8A4C.toInt()
  const val DANGER = 0xFFFF8A80.toInt()
  const val MINT = 0xFF6FD3A5.toInt()

  /** What a character of a password is, so the password can be drawn in colour. */
  enum class CharKind { LETTER, DIGIT, SYMBOL }

  fun charKind(c: Char): CharKind =
    when {
      c.isDigit() -> CharKind.DIGIT
      c.isLetter() -> CharKind.LETTER
      else -> CharKind.SYMBOL
    }

  /** The colour a password character is drawn in: letters plain, digits amber, symbols coral. */
  fun colorOf(c: Char): Int =
    when (charKind(c)) {
      CharKind.LETTER -> TEXT
      CharKind.DIGIT -> AMBER
      CharKind.SYMBOL -> CORAL
    }

  /** "20 characters · letters, digits and symbols": a short, honest description. */
  fun passwordSummary(password: String): String {
    val kinds = password.map { charKind(it) }.toSet()
    val parts = buildList {
      if (CharKind.LETTER in kinds) add("letters")
      if (CharKind.DIGIT in kinds) add("digits")
      if (CharKind.SYMBOL in kinds) add("symbols")
    }
    val what =
      when (parts.size) {
        0 -> ""
        1 -> parts[0]
        else -> parts.dropLast(1).joinToString(", ") + " and " + parts.last()
      }
    val count = if (password.length == 1) "1 character" else "${password.length} characters"
    return if (what.isEmpty()) count else "$count · $what"
  }

  /** The same colour for the same title every time, as in the app's list (0 to 359). */
  fun avatarHue(title: String): Int {
    var hash = 0
    for (c in title) hash = (hash * 31 + c.code) % 360
    return hash
  }

  /** The first letter of the title in capitals, or "?" when there is none. */
  fun avatarLetter(title: String): String {
    val trimmed = title.trim()
    if (trimmed.isEmpty()) return "?"
    return String(Character.toChars(trimmed.codePointAt(0))).uppercase()
  }
}
