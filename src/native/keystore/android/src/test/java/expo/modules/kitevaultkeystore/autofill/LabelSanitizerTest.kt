package expo.modules.kitevaultkeystore.autofill

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LabelSanitizerTest {
  @Test
  fun anOrdinaryNameIsUnchanged() {
    assertEquals("Example App", LabelSanitizer.clean("Example App"))
    assertEquals("Caf\u00E9 \u9280\u884C", LabelSanitizer.clean("Caf\u00E9 \u9280\u884C"))
  }

  @Test
  fun invisibleAndDirectionTricksAreRemoved() {
    assertEquals("Bank", LabelSanitizer.clean("B\u200Ba\u200Dn\u2060k"))
    assertEquals("Bankevil", LabelSanitizer.clean("Bank\u202Eevil"))
    assertEquals("Bank", LabelSanitizer.clean("\u2066Bank\u2069"))
    assertEquals("Bank", LabelSanitizer.clean("\uFEFFBank\u00AD"))
  }

  @Test
  fun lineBreaksAndRunsOfSpacesBecomeOneSpace() {
    assertEquals("Bank Login", LabelSanitizer.clean("Bank\n\nLogin"))
    assertEquals("Bank Login", LabelSanitizer.clean("  Bank \t  Login  "))
  }

  @Test
  fun aNameThatIsNothingButHiddenCharactersIsRejected() {
    assertNull(LabelSanitizer.clean(null))
    assertNull(LabelSanitizer.clean(""))
    assertNull(LabelSanitizer.clean("   "))
    assertNull(LabelSanitizer.clean("\u200B\u202E\u0000"))
  }

  @Test
  fun aVeryLongNameIsCut() {
    val cleaned = LabelSanitizer.clean("A".repeat(500))!!
    assertEquals(LabelSanitizer.MAX_LENGTH, cleaned.length)
    assertEquals('\u2026', cleaned.last())
    assertEquals("A".repeat(60), LabelSanitizer.clean("A".repeat(60)))
  }
}
