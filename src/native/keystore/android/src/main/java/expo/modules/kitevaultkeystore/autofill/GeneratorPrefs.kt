package expo.modules.kitevaultkeystore.autofill

import android.content.Context

/**
 * Remembers the length and the "symbols" choice for the strong password between uses.
 *
 * In simple words: two harmless settings (a number and a yes/no) kept in the app's private
 * preferences. No password, site or account is ever kept here; the file holds only the choice.
 */
internal object GeneratorPrefs {
  private const val FILE = "kitevault_autofill_options"
  private const val KEY_LENGTH = "length"
  private const val KEY_SYMBOLS = "symbols"

  fun load(context: Context): PasswordOptions {
    val prefs = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
    return PasswordOptions(
        length = prefs.getInt(KEY_LENGTH, PasswordGenerator.DEFAULT_LENGTH),
        symbols = prefs.getBoolean(KEY_SYMBOLS, true),
      )
      .normalized()
  }

  fun save(context: Context, options: PasswordOptions) {
    val clean = options.normalized()
    context
      .getSharedPreferences(FILE, Context.MODE_PRIVATE)
      .edit()
      .putInt(KEY_LENGTH, clean.length)
      .putBoolean(KEY_SYMBOLS, clean.symbols)
      .apply()
  }
}
