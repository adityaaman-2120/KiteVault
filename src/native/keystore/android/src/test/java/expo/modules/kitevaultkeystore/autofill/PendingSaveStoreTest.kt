package expo.modules.kitevaultkeystore.autofill

import java.io.File
import java.nio.file.Files
import java.security.SecureRandom
import javax.crypto.AEADBadTagException
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The same kind of sealing as the real one (AES-GCM, fresh IV), with a key kept in memory. */
private class TestSealer(private val key: ByteArray = ByteArray(32).also { SecureRandom().nextBytes(it) }) : Sealer {
  override fun seal(plain: ByteArray): ByteArray {
    val iv = ByteArray(12).also { SecureRandom().nextBytes(it) }
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
    return byteArrayOf(iv.size.toByte()) + iv + cipher.doFinal(plain)
  }

  override fun open(sealed: ByteArray): ByteArray? =
    try {
      val ivLength = sealed[0].toInt() and 0xFF
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, sealed, 1, ivLength))
      cipher.doFinal(sealed, 1 + ivLength, sealed.size - 1 - ivLength)
    } catch (e: AEADBadTagException) {
      null
    } catch (e: Exception) {
      null
    }
}

class PendingSaveStoreTest {
  private var now = 1_000_000L
  private var counter = 0
  private val dir: File = Files.createTempDirectory("pending-test").toFile()
  private val file = File(dir, "pending.bin")
  private val sealer = TestSealer()

  private fun store(s: Sealer = sealer) =
    PendingSaveStore(file, s, clock = { now }, newId = { "id${counter++}" })

  private fun web(user: String = "alice", pass: String = "s3cret-pass", host: String = "example.com") =
    NewSave(SaveKind.WEB, user, pass, host, null, null, null)

  private fun app(user: String = "bob", pass: String = "app-secret", pkg: String = "com.example.app") =
    NewSave(SaveKind.APP, user, pass, null, pkg, "Example App", "AABBCC")

  @Test
  fun parksAndReturnsALogin() {
    val s = store()
    val record = s.add(web())
    val list = s.list()
    assertEquals(1, list.size)
    assertEquals(record.id, list[0].id)
    assertEquals("alice", list[0].save.username)
    assertEquals("s3cret-pass", list[0].save.password)
    assertEquals(SaveKind.WEB, list[0].save.kind)
    assertEquals("example.com", list[0].save.host)
  }

  @Test
  fun anAppLoginKeepsItsPackageNameAndCertificate() {
    val s = store()
    s.add(app())
    val saved = s.list()[0].save
    assertEquals(SaveKind.APP, saved.kind)
    assertEquals("com.example.app", saved.packageName)
    assertEquals("Example App", saved.label)
    assertEquals("AABBCC", saved.certSha256)
  }

  @Test
  fun nothingReadableIsOnDisk() {
    val s = store()
    s.add(web(user = "alice-the-user", pass = "very-secret-password-123", host = "bank.example"))
    val onDisk = file.readBytes()
    val text = String(onDisk, Charsets.ISO_8859_1)
    for (secret in listOf("alice-the-user", "very-secret-password-123", "bank.example", "username", "password")) {
      assertFalse(secret, text.contains(secret))
    }
    assertEquals(1, onDisk[0].toInt()) // the version byte
  }

  @Test
  fun everyWriteUsesAFreshIvSoTheFileChangesEvenForTheSameData() {
    val s = store()
    s.add(web())
    val first = file.readBytes()
    s.add(web())
    assertNotEquals(first.toList(), file.readBytes().toList())
  }

  @Test
  fun noTemporaryFileIsLeftBehind() {
    val s = store()
    s.add(web())
    s.add(app())
    s.remove(s.list()[0].id)
    assertEquals(listOf("pending.bin"), dir.list()!!.toList())
    s.clear()
    assertEquals(emptyList<String>(), dir.list()!!.toList())
  }

  @Test
  fun aNewerSaveForTheSameAccountAndPlaceReplacesTheOlder() {
    val s = store()
    s.add(web(pass = "old-password"))
    now += 1000
    s.add(web(pass = "new-password"))
    val list = s.list()
    assertEquals(1, list.size)
    assertEquals("new-password", list[0].save.password)
  }

  @Test
  fun differentAccountsOrPlacesAreKeptSeparately() {
    val s = store()
    s.add(web(user = "a"))
    s.add(web(user = "b"))
    s.add(web(user = "a", host = "other.com"))
    assertEquals(3, s.list().size)
  }

  @Test
  fun onlyTheNewestThreeAreKept() {
    val s = store()
    for (i in 1..5) {
      s.add(web(user = "user$i"))
      now += 1000
    }
    assertEquals(listOf("user3", "user4", "user5"), s.list().map { it.save.username })
  }

  @Test
  fun aSaveExpiresAfterTenMinutes() {
    val s = store()
    s.add(web())
    now += PendingSaveCodec.MAX_AGE_MS
    assertEquals(1, s.list().size) // exactly ten minutes is still allowed
    now += 1
    assertTrue(s.list().isEmpty())
    assertFalse("the file is removed when nothing is left", file.exists())
  }

  @Test
  fun onlyTheExpiredOnesAreDropped() {
    val s = store()
    s.add(web(user = "old"))
    now += PendingSaveCodec.MAX_AGE_MS - 1000
    s.add(web(user = "new"))
    now += 2000
    assertEquals(listOf("new"), s.list().map { it.save.username })
  }

  @Test
  fun aClockThatWentBackwardsDoesNotKeepARecordForever() {
    val s = store()
    s.add(web())
    now -= 5000
    assertTrue(s.list().isEmpty())
  }

  @Test
  fun removeDeletesOneAndTheFileWhenEmpty() {
    val s = store()
    val a = s.add(web(user = "a"))
    val b = s.add(web(user = "b"))
    assertTrue(s.remove(a.id))
    assertEquals(listOf(b.id), s.list().map { it.id })
    assertFalse(s.remove("unknown"))
    assertTrue(s.remove(b.id))
    assertFalse(file.exists())
  }

  @Test
  fun clearDeletesEverything() {
    val s = store()
    s.add(web())
    s.clear()
    assertFalse(file.exists())
    assertTrue(s.list().isEmpty())
  }

  @Test
  fun aChangedFileIsThrownAway() {
    val s = store()
    s.add(web())
    val bytes = file.readBytes()
    bytes[bytes.size - 3] = (bytes[bytes.size - 3].toInt() xor 1).toByte()
    file.writeBytes(bytes)
    assertTrue(s.list().isEmpty())
    assertFalse(file.exists())
  }

  @Test
  fun garbageOrAWrongVersionIsThrownAway() {
    val s = store()
    file.writeBytes(byteArrayOf(9, 1, 2, 3))
    assertTrue(s.list().isEmpty())
    assertFalse(file.exists())
    file.writeBytes(ByteArray(0))
    assertTrue(s.list().isEmpty())
    assertFalse(file.exists())
  }

  @Test
  fun aFileMadeWithAnotherKeyIsThrownAway() {
    store(TestSealer()).add(web())
    assertTrue(store(TestSealer()).list().isEmpty())
    assertFalse(file.exists())
  }

  @Test
  fun aRecordIsNotLostWhenTheStoreIsReopened() {
    store().add(web())
    assertEquals(1, store().list().size)
  }

  @Test
  fun toStringNeverShowsASecret() {
    val record = store().add(web(user = "alice-the-user", pass = "very-secret-password-123"))
    val shown = record.toString()
    assertFalse(shown.contains("alice-the-user"))
    assertFalse(shown.contains("very-secret-password-123"))
    assertFalse(shown.contains("example.com"))
  }

  @Test
  fun theCodecDropsRecordsThatAreIncomplete() {
    val json =
      """[{"id":"a","createdAt":1,"kind":"WEB","username":"u","password":"p","host":null},
          {"id":"b","createdAt":1,"kind":"APP","username":"u","password":"p","packageName":"x","certSha256":null},
          {"id":"c","createdAt":1,"kind":"WEB","username":"u","password":"","host":"h.com"},
          {"id":"d","createdAt":1,"kind":"OTHER","username":"u","password":"p","host":"h.com"},
          {"id":"e","createdAt":1,"kind":"WEB","username":"u","password":"p","host":"h.com"},
          5, "x"]"""
    val decoded = PendingSaveCodec.decode(json.toByteArray())!!
    assertEquals(listOf("e"), decoded.map { it.id })
    assertNull(PendingSaveCodec.decode("not json".toByteArray()))
  }

  @Test
  fun theSignUpThatUsedASuggestedPasswordReplacesItsNote() {
    val s = store()
    s.add(web(user = "", pass = "Suggested-1!"))
    s.add(web(user = "alice", pass = "Suggested-1!"))
    val list = s.list()
    assertEquals(1, list.size)
    assertEquals("alice", list[0].save.username)
  }

  @Test
  fun aNoteIsOnlyReplacedForTheSamePlaceAndTheSamePassword() {
    val s = store()
    s.add(web(user = "", pass = "Suggested-1!", host = "example.com"))
    s.add(web(user = "alice", pass = "Another-pass-2", host = "example.com")) // other password
    s.add(web(user = "alice", pass = "Suggested-1!", host = "other.com")) // other place
    assertEquals(3, s.list().size)
  }

  @Test
  fun aSaveWithAUserNameIsNeverReplacedByAnotherUserNamesSave() {
    val s = store()
    s.add(web(user = "alice", pass = "same-password-9"))
    s.add(web(user = "bob", pass = "same-password-9"))
    assertEquals(2, s.list().size)
  }

  @Test
  fun aNewNoteForTheSameSuggestionAlsoReplacesTheOldOne() {
    val s = store()
    s.add(web(user = "", pass = "Suggested-1!"))
    s.add(web(user = "", pass = "Suggested-1!"))
    assertEquals(1, s.list().size)
  }

  @Test
  fun aSuggestedPasswordNoteExpiresLikeAnyOtherPendingSave() {
    val s = store()
    s.add(web(user = "", pass = "Suggested-1!"))
    now += PendingSaveCodec.MAX_AGE_MS + 1
    assertEquals(0, s.list().size)
  }
}
