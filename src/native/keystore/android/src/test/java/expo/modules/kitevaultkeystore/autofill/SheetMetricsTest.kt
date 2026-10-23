package expo.modules.kitevaultkeystore.autofill

import org.junit.Assert.assertTrue
import org.junit.Test

/** The sheet is compact, but these limits stop it from becoming hard to tap or hard to read. */
class SheetMetricsTest {
  @Test
  fun everythingYouTapIsBigEnoughToHit() {
    assertTrue("buttons", SheetMetrics.BUTTON_H >= 44)
    assertTrue("rows", SheetMetrics.ROW_MIN >= 48)
    assertTrue("option chips", SheetMetrics.OPTION_H >= 40)
    assertTrue("the symbols chip", SheetMetrics.SYMBOLS_W >= 56)
  }

  @Test
  fun textIsNeverTooSmallToRead() {
    val sizes =
      mapOf(
        "title" to SheetMetrics.TITLE_SP,
        "body" to SheetMetrics.BODY_SP,
        "note" to SheetMetrics.NOTE_SP,
        "button" to SheetMetrics.BUTTON_SP,
        "row title" to SheetMetrics.ROW_TITLE_SP,
        "row detail" to SheetMetrics.ROW_SUB_SP,
        "password" to SheetMetrics.PASSWORD_SP,
        "summary" to SheetMetrics.SUMMARY_SP,
        "pill" to SheetMetrics.CHIP_SP,
        "option label" to SheetMetrics.OPTION_LABEL_SP,
        "option" to SheetMetrics.OPTION_SP,
        "search" to SheetMetrics.SEARCH_SP,
        "loading" to SheetMetrics.LOADING_SP,
        "empty" to SheetMetrics.EMPTY_SP,
      )
    for ((name, sp) in sizes) assertTrue("$name is $sp sp", sp >= 12f)
  }

  @Test
  fun theTypeScaleKeepsItsOrder() {
    assertTrue(SheetMetrics.TITLE_SP > SheetMetrics.BODY_SP)
    assertTrue(SheetMetrics.BODY_SP > SheetMetrics.NOTE_SP)
    assertTrue(SheetMetrics.ROW_TITLE_SP > SheetMetrics.ROW_SUB_SP)
    assertTrue(SheetMetrics.BRAND_SP < SheetMetrics.TITLE_SP)
  }

  @Test
  fun theSheetStaysCompactAndLeavesRoomToTapOutsideIt() {
    assertTrue(SheetMetrics.SHEET_SIDE <= 16)
    assertTrue(SheetMetrics.SHEET_GAP_ABOVE >= 48) // the dimmed area above stays tappable
    assertTrue(SheetMetrics.BUTTON_H <= 48)
    assertTrue(SheetMetrics.TITLE_SP <= 20f)
  }

  @Test
  fun shapesAreRoundedSoTheyAreNeverSquarerThanTheirContent() {
    assertTrue(SheetMetrics.BUTTON_RADIUS * 2 >= SheetMetrics.BUTTON_H - 2) // a pill
    assertTrue(SheetMetrics.OPTION_RADIUS * 2 >= SheetMetrics.OPTION_H - 2)
    assertTrue(SheetMetrics.AVATAR_RADIUS * 2 < SheetMetrics.AVATAR) // a rounded square, not a circle
  }
}
