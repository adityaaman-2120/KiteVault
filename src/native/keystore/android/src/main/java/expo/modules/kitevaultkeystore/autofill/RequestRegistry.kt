package expo.modules.kitevaultkeystore.autofill

import java.security.SecureRandom

/**
 * A short-lived notebook that links a "ticket" to the question we asked.
 *
 * In simple words: when a login box is tapped, the service writes down what it saw (who asked,
 * which boxes) and gives the unlock screen only a random ticket number. The unlock screen
 * hands the ticket back to get the facts. A ticket works once, runs out after one minute, and is
 * kept only in memory. So another app cannot start the unlock screen with made-up facts, and an
 * old unlock result cannot be replayed.
 */
internal class RequestRegistry<T : Any>(
  private val clock: () -> Long = System::currentTimeMillis,
  private val ttlMs: Long = 60_000,
  private val maxSize: Int = 8,
  private val random: SecureRandom = SecureRandom(),
) {
  private class Entry<T>(val value: T, val expiresAt: Long)

  private val entries = LinkedHashMap<String, Entry<T>>()

  /** Stores [value] and returns its ticket (128 random bits as 32 hex characters). */
  @Synchronized
  fun put(value: T): String {
    purgeExpired()
    while (entries.size >= maxSize) entries.remove(entries.keys.first())
    val bytes = ByteArray(16).also { random.nextBytes(it) }
    val ticket = bytes.joinToString("") { "%02x".format(it) }
    entries[ticket] = Entry(value, clock() + ttlMs)
    return ticket
  }

  /** Returns the stored value once; null if the ticket is unknown, used, or too old. */
  @Synchronized
  fun take(ticket: String?): T? {
    if (ticket == null) return null
    val entry = entries.remove(ticket) ?: return null
    return if (clock() <= entry.expiresAt) entry.value else null
  }

  private fun purgeExpired() {
    val now = clock()
    entries.entries.removeAll { it.value.expiresAt < now }
  }
}
