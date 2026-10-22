package expo.modules.kitevaultkeystore.autofill

import java.io.File
import java.nio.file.Files
import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Reads a vault file that the REAL app code wrote (src/vault/__tests__/autofillFixture.test.ts),
 * so a mismatch between the TypeScript file format and this Kotlin reader fails a test.
 */
class VaultReaderTest {
  private fun resource(name: String): ByteArray =
    javaClass.getResourceAsStream("/$name")!!.use { it.readBytes() }

  private val file = resource("vault-fixture.kvlt")
  private val key: ByteArray =
    JSONObject(String(resource("vault-fixture.json"))).getString("keyHex").let { hex ->
      ByteArray(32) { hex.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
    }

  private fun kindOf(block: () -> Unit): VaultReadException.Kind? =
    try {
      block()
      null
    } catch (e: VaultReadException) {
      e.kind
    }

  @Test
  fun decryptsTheFileTheAppWrote() {
    val plain = VaultReader.decrypt(file, key)
    val logins = VaultReader.parseLogins(plain)
    // Notes, cards and the Trash are left out.
    assertEquals(listOf("github", "app", "mail", "unicode", "androidapp"), logins.map { it.id })
    val github = logins[0]
    assertEquals("GitHub", github.title)
    assertEquals("octocat", github.username)
    assertEquals("gh-pass-1", github.password)
    assertEquals(listOf("https://github.com/login", "http://www.github.com"), github.urls)
    assertEquals(listOf(AppLink("com.example.app", "AA:BB:CC:DD")), logins[1].appLinks)
  }

  @Test
  fun keepsNonAsciiTextIntact() {
    val unicode =
      VaultReader.parseLogins(VaultReader.decrypt(file, key)).first { it.id == "unicode" }
    assertEquals("pässwörd-🔑", unicode.password)
    assertEquals("Café ünïcode", unicode.title)
  }

  @Test
  fun neverReturnsNotesCardsOrTrashedLogins() {
    val text = String(VaultReader.decrypt(file, key))
    assertTrue(text.contains("secret note")) // it IS in the vault...
    val logins = VaultReader.parseLogins(text.toByteArray())
    // ...but nothing of it is copied out.
    assertFalse(logins.any { it.id in setOf("note", "card", "trashed") })
    assertFalse(logins.any { it.password == "old-pass" })
  }

  @Test
  fun aWrongKeyIsReportedAsWrongKey() {
    val wrong = key.copyOf().also { it[0] = (it[0] + 1).toByte() }
    assertEquals(VaultReadException.Kind.WRONG_KEY, kindOf { VaultReader.decrypt(file, wrong) })
    assertEquals(
      VaultReadException.Kind.WRONG_KEY,
      kindOf { VaultReader.decrypt(file, ByteArray(16)) },
    )
  }

  @Test
  fun aChangedByteAnywhereInTheBodyIsDetected() {
    val offset = VaultReader.bodyOffset(file)!!
    for (position in listOf(offset, offset + 12, offset + 40, file.size - 1)) {
      val copy = file.copyOf().also { it[position] = (it[position].toInt() xor 1).toByte() }
      assertEquals(
        "byte $position",
        VaultReadException.Kind.WRONG_KEY,
        kindOf { VaultReader.decrypt(copy, key) },
      )
    }
  }

  @Test
  fun damagedFilesAreRefused() {
    assertNull(VaultReader.bodyOffset(file.copyOf(10)))
    assertNull(VaultReader.bodyOffset(ByteArray(0)))
    val badMagic = file.copyOf().also { it[0] = 0 }
    assertNull(VaultReader.bodyOffset(badMagic))
    val zeroHeader = file.copyOf().also { it[4] = 0; it[5] = 0 }
    assertNull(VaultReader.bodyOffset(zeroHeader))
    val hugeHeader = file.copyOf().also { it[4] = 0x7F; it[5] = 0 }
    assertNull(VaultReader.bodyOffset(hugeHeader))
    assertEquals(
      VaultReadException.Kind.DAMAGED,
      kindOf { VaultReader.decrypt(file.copyOf(10), key) },
    )
  }

  @Test
  fun aNewerFormatVersionIsRefusedNotGuessed() {
    val text = String(file, Charsets.ISO_8859_1)
    val changed = text.replaceFirst("\"formatVersion\":1", "\"formatVersion\":2")
    assertEquals(text.length, changed.length)
    val newer = changed.toByteArray(Charsets.ISO_8859_1)
    assertEquals(VaultReadException.Kind.UNSUPPORTED, kindOf { VaultReader.bodyOffset(newer) })
  }

  @Test
  fun aNewerDataVersionIsRefused() {
    val json = """{"version":2,"entries":[],"folders":[],"settings":{}}""".toByteArray()
    assertEquals(VaultReadException.Kind.UNSUPPORTED, kindOf { VaultReader.parseLogins(json) })
    assertEquals(
      VaultReadException.Kind.DAMAGED,
      kindOf { VaultReader.parseLogins("not json".toByteArray()) },
    )
  }

  @Test
  fun unknownFieldsAreIgnored() {
    val json =
      """{"version":1,"future":{"a":1},"entries":[{"id":"x","type":"login","title":"T","username":"u",
        "password":"p","urls":["https://a.com"],"surprise":[1,2,3],"customFields":[{"id":"1"}]}],"folders":[]}"""
        .toByteArray()
    val logins = VaultReader.parseLogins(json)
    assertEquals(1, logins.size)
    assertEquals("p", logins[0].password)
  }

  @Test
  fun entriesWithoutAnIdOrWithABadShapeAreSkipped() {
    val json =
      """{"version":1,"entries":[5,"x",{"type":"login"},{"id":"ok","type":"login","urls":"nope","appLinks":[{"packageName":"a"}]}]}"""
        .toByteArray()
    val logins = VaultReader.parseLogins(json)
    assertEquals(listOf("ok"), logins.map { it.id })
    assertTrue(logins[0].urls.isEmpty())
    assertTrue(logins[0].appLinks.isEmpty())
  }

  @Test
  fun aTwoThousandEntryVaultParses() {
    val entries =
      (1..2000).joinToString(",") {
        """{"id":"e$it","type":"login","title":"Site $it","username":"u$it","password":"p$it","urls":["https://s$it.example"]}"""
      }
    val logins = VaultReader.parseLogins("""{"version":1,"entries":[$entries]}""".toByteArray())
    assertEquals(2000, logins.size)
  }

  @Test
  fun wipeZeroesTheBytes() {
    val bytes = byteArrayOf(1, 2, 3)
    VaultReader.wipe(bytes)
    assertArrayEquals(byteArrayOf(0, 0, 0), bytes)
    VaultReader.wipe(null) // must not crash
  }

  // --- finding the file on disk ---

  private fun tempDir(): File = Files.createTempDirectory("vault-test").toFile()

  @Test
  fun readsTheMainFileAndLeavesEverythingUntouched() {
    val dir = tempDir()
    File(dir, "vault.kvlt").writeBytes(file)
    val before = File(dir, "vault.kvlt").lastModified()
    assertArrayEquals(file, VaultReader.readVaultFile(dir, pause = {}))
    assertEquals(listOf("vault.kvlt"), dir.list()!!.toList())
    assertEquals(before, File(dir, "vault.kvlt").lastModified())
  }

  @Test
  fun fallsBackToTheBackupWhenTheMainFileIsDamaged() {
    val dir = tempDir()
    File(dir, "vault.kvlt").writeBytes(file.copyOf(40))
    File(dir, "vault.kvlt.bak").writeBytes(file)
    assertArrayEquals(file, VaultReader.readVaultFile(dir, pause = {}))
  }

  @Test
  fun fallsBackToTheBackupWhenTheMainFileIsMissingDuringASave() {
    val dir = tempDir()
    File(dir, "vault.kvlt.bak").writeBytes(file)
    assertArrayEquals(file, VaultReader.readVaultFile(dir, pause = {}))
  }

  @Test
  fun retriesOnceWhenASaveIsInTheMiddleOfSwapping() {
    val dir = tempDir()
    var pauses = 0
    val bytes =
      VaultReader.readVaultFile(dir) {
        pauses++
        File(dir, "vault.kvlt").writeBytes(file) // the save finishes while we wait
      }
    assertEquals(1, pauses)
    assertArrayEquals(file, bytes)
  }

  @Test
  fun reportsMissingAndDamaged() {
    val empty = tempDir()
    assertEquals(
      VaultReadException.Kind.MISSING,
      kindOf { VaultReader.readVaultFile(empty, pause = {}) },
    )
    val damaged = tempDir()
    File(damaged, "vault.kvlt").writeBytes(ByteArray(100))
    assertEquals(
      VaultReadException.Kind.DAMAGED,
      kindOf { VaultReader.readVaultFile(damaged, pause = {}) },
    )
  }

  @Test
  fun errorMessagesNeverContainVaultData() {
    try {
      VaultReader.decrypt(file, ByteArray(32))
    } catch (e: VaultReadException) {
      assertEquals("WRONG_KEY", e.message)
    }
  }
}
