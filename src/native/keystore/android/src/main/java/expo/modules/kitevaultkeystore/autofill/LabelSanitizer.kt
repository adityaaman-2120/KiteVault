package expo.modules.kitevaultkeystore.autofill

/**
 * Makes an app's display name safe to show in a security prompt.
 *
 * In simple words: an app chooses its own name, so a hostile app can pick a misleading one. This
 * removes the tricks that make a name look like something else: invisible characters, characters
 * that flip the reading direction (so "evil" can be made to look like "live"), line breaks, and
 * very long names that push the real package name out of sight. The package name is always shown
 * next to the name and cannot be faked.
 */
internal object LabelSanitizer {
  const val MAX_LENGTH = 60

  private val WHITESPACE = Regex("\\s+")

  private fun isHidden(c: Char): Boolean =
    Character.isISOControl(c) ||
      c in '\u200B'..'\u200F' || // zero-width characters and left/right marks
      c in '\u202A'..'\u202E' || // bidi embeddings and overrides
      c in '\u2060'..'\u2064' || // word joiner and invisible operators
      c in '\u2066'..'\u2069' || // bidi isolates
      c == '\u061C' || // Arabic letter mark
      c == '\uFEFF' || // zero-width no-break space
      c == '\u00AD' // soft hyphen

  /** Returns the cleaned name, or null if nothing readable is left. */
  fun clean(raw: String?): String? {
    if (raw == null) return null
    // Line breaks and tabs count as spaces (they are "control" characters too, so they must be
    // turned into spaces BEFORE the hidden characters are removed, or words would run together).
    val spaced = raw.map { if (it.isWhitespace()) ' ' else it }.joinToString("")
    val visible = spaced.filterNot { isHidden(it) }.replace(WHITESPACE, " ").trim()
    if (visible.isEmpty()) return null
    return if (visible.length <= MAX_LENGTH) visible else visible.take(MAX_LENGTH - 1) + "\u2026"
  }
}
