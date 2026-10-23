package expo.modules.kitevaultkeystore.autofill

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class PasswordGeneratorTest {
  private val allowed =
    (PasswordGenerator.LOWER + PasswordGenerator.UPPER + PasswordGenerator.DIGITS + PasswordGenerator.SYMBOLS).toSet()

  @Test
  fun hasTheDefaultLengthAndOnlyAllowedCharacters() {
    val password = PasswordGenerator.generate()
    assertEquals(PasswordGenerator.DEFAULT_LENGTH, password.length)
    assertTrue(password.all { it in allowed })
  }

  @Test
  fun alwaysHasOneOfEachKindSoStrictSignUpFormsAcceptIt() {
    repeat(200) {
      val password = PasswordGenerator.generate()
      assertTrue(password.any { it in PasswordGenerator.LOWER })
      assertTrue(password.any { it in PasswordGenerator.UPPER })
      assertTrue(password.any { it in PasswordGenerator.DIGITS })
      assertTrue(password.any { it in PasswordGenerator.SYMBOLS })
    }
  }

  @Test
  fun respectsTheRequestedLength() {
    for (length in listOf(8, 12, 32, 64)) {
      assertEquals(length, PasswordGenerator.generate(length).length)
    }
  }

  @Test
  fun refusesAPasswordThatWouldBeTooShort() {
    assertThrows(IllegalArgumentException::class.java) { PasswordGenerator.generate(PasswordGenerator.MIN_LENGTH - 1) }
  }

  @Test
  fun symbolsAvoidTheCharactersThatBreakWebForms() {
    for (bad in listOf('"', '\'', '\\', ' ', '<', '>', '`', '(', ')', '{', '}', '[', ']')) {
      assertTrue("symbol list contains $bad", bad !in PasswordGenerator.SYMBOLS)
    }
  }

  @Test
  fun everyDrawAsksForANumberInsideTheAllowedRange() {
    val asked = mutableListOf<Int>()
    val random = RandomSource { bound ->
      assertTrue("bound must be positive", bound > 0)
      asked.add(bound)
      0
    }
    PasswordGenerator.generate(20, random = random)
    // 4 guaranteed picks + 16 fill-ins + 19 shuffle steps
    assertEquals(4 + 16 + 19, asked.size)
    assertTrue(asked.all { it in 1..PasswordGenerator.LOWER.length * 4 })
  }

  @Test
  fun theSameRandomNumbersGiveTheSamePassword() {
    fun source(): RandomSource {
      var next = 3
      return RandomSource { bound -> (next++ * 7) % bound }
    }
    assertEquals(PasswordGenerator.generate(20, random = source()), PasswordGenerator.generate(20, random = source()))
  }

  @Test
  fun theRealSourceGivesADifferentPasswordEachTime() {
    val many = (1..500).map { PasswordGenerator.generate() }.toSet()
    assertEquals(500, many.size)
    assertNotEquals(many.first(), many.last())
  }

  @Test
  fun everyCharacterOfEachKindCanBeChosen() {
    // With the real source, 20,000 characters should reach every letter, digit and symbol.
    val seen = HashSet<Char>()
    repeat(1000) { PasswordGenerator.generate().forEach { seen.add(it) } }
    assertEquals(allowed, seen)
  }

  @Test
  fun withoutSymbolsThereAreOnlyLettersAndDigitsButStillOneOfEachKind() {
    repeat(200) {
      val password = PasswordGenerator.generate(16, symbols = false)
      assertEquals(16, password.length)
      assertTrue(password.none { it in PasswordGenerator.SYMBOLS })
      assertTrue(password.any { it in PasswordGenerator.LOWER })
      assertTrue(password.any { it in PasswordGenerator.UPPER })
      assertTrue(password.any { it in PasswordGenerator.DIGITS })
    }
  }

  @Test
  fun aPasswordCannotBeLongerThanTheLimit() {
    assertEquals(PasswordGenerator.MAX_LENGTH, PasswordGenerator.generate(PasswordGenerator.MAX_LENGTH).length)
    assertThrows(IllegalArgumentException::class.java) { PasswordGenerator.generate(PasswordGenerator.MAX_LENGTH + 1) }
  }

  @Test
  fun theOffersOnTheSheetAreAllAllowedLengths() {
    assertTrue(PasswordGenerator.LENGTH_CHOICES.isNotEmpty())
    for (n in PasswordGenerator.LENGTH_CHOICES) {
      assertTrue(n in PasswordGenerator.MIN_LENGTH..PasswordGenerator.MAX_LENGTH)
      assertEquals(n, PasswordGenerator.generate(PasswordOptions(length = n)).length)
    }
    assertTrue(PasswordGenerator.DEFAULT_LENGTH in PasswordGenerator.LENGTH_CHOICES)
  }

  @Test
  fun optionsAreKeptInsideTheAllowedRange() {
    assertEquals(PasswordGenerator.MIN_LENGTH, PasswordOptions(length = 1).normalized().length)
    assertEquals(PasswordGenerator.MAX_LENGTH, PasswordOptions(length = 500).normalized().length)
    assertEquals(20, PasswordOptions().normalized().length)
    assertTrue(PasswordOptions().symbols)
  }

  @Test
  fun generatingFromOptionsFollowsThem() {
    val plain = PasswordGenerator.generate(PasswordOptions(length = 12, symbols = false))
    assertEquals(12, plain.length)
    assertTrue(plain.none { it in PasswordGenerator.SYMBOLS })
    assertTrue(PasswordGenerator.generate(PasswordOptions(length = 32)).length == 32)
  }
}
