package expo.modules.kitevaultkeystore.autofill

import java.security.SecureRandom

/** A source of random numbers: [below] returns 0 up to (not including) `bound`, all equally likely. */
internal fun interface RandomSource {
  fun below(bound: Int): Int
}

/**
 * What the person chose for the next suggested password. Many sign-up pages cap the length or
 * refuse symbols, so both can be changed on the sheet, and the choice is remembered.
 */
internal data class PasswordOptions(
  val length: Int = PasswordGenerator.DEFAULT_LENGTH,
  val symbols: Boolean = true,
) {
  /** The same choice, with the length kept between the smallest and the largest allowed. */
  fun normalized(): PasswordOptions =
    copy(length = length.coerceIn(PasswordGenerator.MIN_LENGTH, PasswordGenerator.MAX_LENGTH))
}

/**
 * Makes the strong password KiteVault suggests on a sign-up page.
 *
 * In simple words: it picks characters one at a time from the lists below. The randomness comes
 * from Android's `SecureRandom` (a vetted source, never `Math.random`), and `nextInt(bound)` picks
 * every character with the same chance, so no character is favoured. The password always has at
 * least one lower-case letter, one capital and one digit, and one symbol when symbols are on,
 * because many sign-up pages insist on that, and the characters are then shuffled so those are
 * not always first.
 *
 * The symbols are the ones web forms nearly always accept: no quotes, no backslash, no brackets,
 * no spaces. There are 20 characters by default: about 120 bits of randomness with symbols, about
 * 119 without them (a longer password makes up for the smaller alphabet).
 */
internal object PasswordGenerator {
  const val DEFAULT_LENGTH = 20
  const val MIN_LENGTH = 8
  const val MAX_LENGTH = 64

  /** The lengths offered on the sheet: short for strict sites, long for everything else. */
  val LENGTH_CHOICES = listOf(12, 16, 20, 32)

  const val LOWER = "abcdefghijklmnopqrstuvwxyz"
  const val UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  const val DIGITS = "0123456789"
  const val SYMBOLS = "!@#\$%^&*-_+=?"

  private val secure = SecureRandom()
  val system = RandomSource { bound -> secure.nextInt(bound) }

  fun generate(options: PasswordOptions = PasswordOptions(), random: RandomSource = system): String =
    generate(options.length, options.symbols, random)

  fun generate(length: Int, symbols: Boolean = true, random: RandomSource = system): String {
    require(length >= MIN_LENGTH) { "A password needs at least $MIN_LENGTH characters." }
    require(length <= MAX_LENGTH) { "A password can have at most $MAX_LENGTH characters." }
    val groups = if (symbols) listOf(LOWER, UPPER, DIGITS, SYMBOLS) else listOf(LOWER, UPPER, DIGITS)
    val everything = groups.joinToString("")

    val chars = ArrayList<Char>(length)
    for (group in groups) chars.add(group[random.below(group.length)])
    while (chars.size < length) chars.add(everything[random.below(everything.length)])

    // Fisher-Yates shuffle: every order is equally likely.
    for (i in chars.size - 1 downTo 1) {
      val j = random.below(i + 1)
      val swap = chars[i]
      chars[i] = chars[j]
      chars[j] = swap
    }
    return String(chars.toCharArray())
  }
}
