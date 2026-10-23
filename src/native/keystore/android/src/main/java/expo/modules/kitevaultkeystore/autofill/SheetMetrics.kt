package expo.modules.kitevaultkeystore.autofill

/**
 * Every size used by the sheet KiteVault shows on top of other apps, in one place (dp for sizes
 * and spaces, sp for text). It holds no Android classes, so a unit test can keep the sizes sensible:
 * compact, but never so small that a button is hard to hit or text hard to read.
 *
 * The sheet is deliberately compact: it appears over somebody else's app, so it should take as
 * little of that app's screen as it can while staying easy to use.
 */
internal object SheetMetrics {
  // The sheet and its frame
  const val SHEET_RADIUS = 22
  const val SHEET_SIDE = 16
  const val SHEET_TOP = 8
  const val SHEET_BOTTOM = 14
  const val SHEET_GAP_ABOVE = 56
  const val SLIDE = 36
  const val CONTENT_TOP = 8
  const val HANDLE_W = 32
  const val HANDLE_H = 4
  const val HANDLE_GAP = 8

  // The kite and the name
  const val MARK_W = 17
  const val MARK_H = 23
  const val BRAND_SP = 15f
  const val BRAND_GAP = 8

  // The pill that says who it is for
  const val CHIP_SP = 12f
  const val CHIP_ICON = 12
  const val CHIP_PAD_V = 4
  const val CHIP_PAD_START = 8
  const val CHIP_PAD_END = 10
  const val CHIP_GAP = 5
  const val CHIP_TOP = 8
  const val CHIP_BOTTOM = 2

  // Text
  const val TITLE_SP = 18f
  const val TITLE_GAP = 4
  const val BODY_SP = 13.5f
  const val BODY_LINE = 1.1f
  const val BODY_GAP = 12
  const val NOTE_SP = 12f
  const val NOTE_GAP = 10

  // A message with an icon, and the spinner
  const val MESSAGE_CIRCLE = 44
  const val MESSAGE_ICON = 22
  const val MESSAGE_GAP = 10
  const val LOADING_PAD = 14
  const val SPINNER = 30
  const val LOADING_SP = 13.5f
  const val LOADING_GAP = 8

  // Buttons
  const val BUTTON_H = 46
  const val BUTTON_SP = 15f
  const val BUTTON_RADIUS = 23
  const val BUTTON_PAD = 16
  const val BUTTON_GAP = 8

  // A login in a list
  const val ROW_MIN = 52
  const val ROW_PAD = 10
  const val ROW_RADIUS = 16
  const val ROW_GAP = 8
  const val ROW_TEXT_GAP = 12
  const val ROW_TITLE_SP = 14.5f
  const val ROW_SUB_SP = 12.5f
  const val AVATAR = 36
  const val AVATAR_RADIUS = 11
  const val AVATAR_SP = 16f
  const val CHEVRON = 18

  // The password
  const val PASSWORD_SP = 16f
  const val PASSWORD_PAD_V = 12
  const val PASSWORD_PAD_H = 14
  const val PASSWORD_RADIUS = 14
  const val PASSWORD_GAP = 8
  const val SUMMARY_SP = 12f
  const val SUMMARY_GAP = 10

  // The options (length, symbols)
  const val OPTION_LABEL_SP = 12f
  const val OPTION_H = 40
  const val OPTION_SP = 14f
  const val OPTION_RADIUS = 20
  const val OPTION_GAP = 6
  const val OPTION_LABEL_GAP = 4
  const val OPTION_ROW_GAP = 8
  const val SYMBOLS_W = 64
  const val OPTIONS_BOTTOM = 12

  // Search
  const val SEARCH_SP = 14.5f
  const val SEARCH_PAD_V = 11
  const val SEARCH_PAD_H = 14
  const val SEARCH_RADIUS = 14
  const val SEARCH_GAP = 10
  const val EMPTY_SP = 14f
  const val EMPTY_PAD = 14
}
