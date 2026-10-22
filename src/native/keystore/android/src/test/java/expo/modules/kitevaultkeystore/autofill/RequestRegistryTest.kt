package expo.modules.kitevaultkeystore.autofill

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RequestRegistryTest {
  private var now = 1_000L

  private fun registry(maxSize: Int = 8) =
    RequestRegistry<String>(clock = { now }, ttlMs = 60_000, maxSize = maxSize)

  @Test
  fun aTicketWorksOnce() {
    val r = registry()
    val ticket = r.put("facts")
    assertEquals("facts", r.take(ticket))
    assertNull(r.take(ticket))
  }

  @Test
  fun ticketsAreLongRandomHex() {
    val r = registry()
    val a = r.put("a")
    val b = r.put("b")
    assertTrue(a.matches(Regex("[0-9a-f]{32}")))
    assertNotEquals(a, b)
  }

  @Test
  fun aTicketExpiresAfterAMinute() {
    val r = registry()
    val ticket = r.put("facts")
    now += 60_001
    assertNull(r.take(ticket))
  }

  @Test
  fun unknownOrMissingTicketsGiveNothing() {
    val r = registry()
    assertNull(r.take(null))
    assertNull(r.take("0".repeat(32)))
    assertNull(r.take(""))
  }

  @Test
  fun theOldestTicketsAreDroppedWhenFull() {
    val r = registry(maxSize = 2)
    val first = r.put("1")
    val second = r.put("2")
    val third = r.put("3")
    assertNull(r.take(first))
    assertEquals("2", r.take(second))
    assertEquals("3", r.take(third))
  }
}
