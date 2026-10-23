package expo.modules.kitevaultkeystore.autofill

import kotlin.math.pow
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AutofillStyleTest {
  // WCAG contrast ratio between two 0xAARRGGBB colours, as in the app's own contrast tests.
  private fun luminance(color: Int): Double {
    fun channel(shift: Int): Double {
      val v = ((color shr shift) and 0xFF) / 255.0
      return if (v <= 0.03928) v / 12.92 else ((v + 0.055) / 1.055).pow(2.4)
    }
    return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
  }

  private fun contrast(a: Int, b: Int): Double {
    val (light, dark) = listOf(luminance(a), luminance(b)).sortedDescending()
    return (light + 0.05) / (dark + 0.05)
  }

  private fun assertReadable(label: String, text: Int, background: Int) {
    val ratio = contrast(text, background)
    assertTrue("$label has contrast $ratio, needs 4.5", ratio >= 4.5)
  }

  @Test
  fun everyTextColourIsReadableOnWhatItIsDrawnOn() {
    assertReadable("text on the sheet", AutofillStyle.TEXT, AutofillStyle.SHEET)
    assertReadable("muted text on the sheet", AutofillStyle.MUTED, AutofillStyle.SHEET)
    assertReadable("text on a row", AutofillStyle.TEXT, AutofillStyle.ROW)
    assertReadable("muted text on a row", AutofillStyle.MUTED, AutofillStyle.ROW)
    assertReadable("muted text on the pill", AutofillStyle.MUTED, AutofillStyle.CHIP)
    assertReadable("button text on amber", AutofillStyle.ON_AMBER, AutofillStyle.AMBER)
    assertReadable("button text on coral", AutofillStyle.ON_AMBER, AutofillStyle.CORAL)
    assertReadable("button text on the grey button", AutofillStyle.TEXT, AutofillStyle.CHIP)
    assertReadable("muted text on the sheet (text button)", AutofillStyle.MUTED, AutofillStyle.SHEET)
    assertReadable("green tick line on the sheet", AutofillStyle.MINT, AutofillStyle.SHEET)
  }

  @Test
  fun thePasswordColoursAreReadableOnTheDarkBox() {
    for (c in listOf('a', 'Z', '7', '!', '#')) {
      assertReadable("password character $c", AutofillStyle.colorOf(c), AutofillStyle.FIELD)
    }
  }

  @Test
  fun passwordCharactersGetTheirKindAndColour() {
    assertEquals(AutofillStyle.CharKind.LETTER, AutofillStyle.charKind('a'))
    assertEquals(AutofillStyle.CharKind.LETTER, AutofillStyle.charKind('Q'))
    assertEquals(AutofillStyle.CharKind.DIGIT, AutofillStyle.charKind('0'))
    for (symbol in PasswordGenerator.SYMBOLS) {
      assertEquals(AutofillStyle.CharKind.SYMBOL, AutofillStyle.charKind(symbol))
    }
    assertEquals(AutofillStyle.TEXT, AutofillStyle.colorOf('k'))
    assertEquals(AutofillStyle.AMBER, AutofillStyle.colorOf('4'))
    assertEquals(AutofillStyle.CORAL, AutofillStyle.colorOf('$'))
  }

  @Test
  fun everyGeneratedPasswordCharacterHasAKind() {
    val all = (PasswordGenerator.LOWER + PasswordGenerator.UPPER + PasswordGenerator.DIGITS + PasswordGenerator.SYMBOLS)
    assertTrue(all.all { AutofillStyle.colorOf(it) != 0 })
  }

  @Test
  fun theSummaryNamesWhatIsInThePassword() {
    assertEquals("8 characters · letters, digits and symbols", AutofillStyle.passwordSummary("Abc123!x"))
    assertEquals("6 characters · letters and digits", AutofillStyle.passwordSummary("abc123"))
    assertEquals("3 characters · letters", AutofillStyle.passwordSummary("abc"))
    assertEquals("4 characters · digits and symbols", AutofillStyle.passwordSummary("12!?"))
    assertEquals("1 character · letters", AutofillStyle.passwordSummary("a"))
    assertEquals("0 characters", AutofillStyle.passwordSummary(""))
  }

  @Test
  fun theSummaryOfARealGeneratedPasswordSaysItIsTwentyLong() {
    val summary = AutofillStyle.passwordSummary(PasswordGenerator.generate())
    assertEquals("20 characters · letters, digits and symbols", summary)
  }

  @Test
  fun theAvatarColourIsTheSameAsInTheApp() {
    // The app computes: hash = (hash * 31 + charCode) % 360, over every character.
    assertEquals(0, AutofillStyle.avatarHue(""))
    assertEquals(65, AutofillStyle.avatarHue("A"))
    assertEquals(281, AutofillStyle.avatarHue("AB"))
    assertEquals(AutofillStyle.avatarHue("GitHub"), AutofillStyle.avatarHue("GitHub"))
    assertTrue(AutofillStyle.avatarHue("A much longer title with many words in it") in 0..359)
  }

  @Test
  fun theAvatarLetterIsTheFirstCharacterInCapitals() {
    assertEquals("G", AutofillStyle.avatarLetter("github"))
    assertEquals("X", AutofillStyle.avatarLetter("   x marks"))
    assertEquals("?", AutofillStyle.avatarLetter(""))
    assertEquals("?", AutofillStyle.avatarLetter("   "))
    // A character made of two UTF-16 units is not cut in half.
    assertEquals("😀", AutofillStyle.avatarLetter("😀 smile"))
  }
}
