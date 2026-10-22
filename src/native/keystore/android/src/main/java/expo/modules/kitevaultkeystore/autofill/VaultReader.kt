package expo.modules.kitevaultkeystore.autofill

import java.io.File
import java.security.GeneralSecurityException
import java.util.Arrays
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/** Why the vault could not be read. The message never contains vault data. */
internal class VaultReadException(val kind: Kind) : Exception(kind.name) {
  enum class Kind {
    /** There is no vault file. */
    MISSING,

    /** The file is damaged or not a KiteVault file. */
    DAMAGED,

    /** The file was made by a different version of KiteVault. */
    UNSUPPORTED,

    /** The key does not open the file (the vault key changed, or the file was altered). */
    WRONG_KEY,
  }
}

/**
 * Reads `vault.kvlt` (the file format of Step 4) and pulls out the saved logins. READ ONLY.
 *
 * In simple words: the app keeps the vault in one encrypted file. This class opens that file with
 * the vault key (which the fingerprint check released), decrypts it with the phone's own AES-GCM
 * routine, and copies out just the logins. It never changes, renames or deletes any file: the
 * app's main code is the only writer, and two writers would lose data.
 *
 * The file layout (see docs/DECISIONS.md):
 * ```
 * "KVLT" | header length (2 bytes, big endian) | header (JSON) | body
 * body = iv (12 bytes) | encrypted vault JSON | tag (16 bytes)
 * ```
 */
internal object VaultReader {
  private val MAGIC = byteArrayOf(0x4B, 0x56, 0x4C, 0x54) // "KVLT"
  private const val MAX_HEADER_BYTES = 4096
  private const val IV_LENGTH = 12
  private const val TAG_BITS = 128
  private const val MIN_BODY_LENGTH = IV_LENGTH + 16
  private const val MAX_FILE_BYTES = 64 * 1024 * 1024
  private const val FORMAT_VERSION = 1
  private const val DATA_VERSION = 1

  const val MAIN_FILE = "vault.kvlt"
  const val BACKUP_FILE = "vault.kvlt.bak"

  /**
   * Returns the bytes of the vault file in [dir]. If the main file is missing or not a complete
   * vault, the `.bak` file is used: during the app's crash-safe save, one of the two is always
   * complete. If neither is, it waits a moment and tries once more (a save may be mid-swap).
   */
  fun readVaultFile(dir: File, pause: () -> Unit = { Thread.sleep(150) }): ByteArray {
    repeat(2) { attempt ->
      for (name in listOf(MAIN_FILE, BACKUP_FILE)) {
        val file = File(dir, name)
        if (!file.isFile || file.length() > MAX_FILE_BYTES) continue
        val bytes = file.readBytes()
        if (bodyOffset(bytes) != null) return bytes
      }
      if (attempt == 0) pause()
    }
    throw VaultReadException(
      if (File(dir, MAIN_FILE).exists() || File(dir, BACKUP_FILE).exists())
        VaultReadException.Kind.DAMAGED
      else VaultReadException.Kind.MISSING
    )
  }

  /**
   * Where the encrypted body starts, or null if [file] is not a structurally complete vault.
   * Throws UNSUPPORTED for a file made by another format version.
   */
  fun bodyOffset(file: ByteArray): Int? {
    if (file.size < MAGIC.size + 2) return null
    for (i in MAGIC.indices) if (file[i] != MAGIC[i]) return null
    val headerLength = ((file[4].toInt() and 0xFF) shl 8) or (file[5].toInt() and 0xFF)
    if (headerLength == 0 || headerLength > MAX_HEADER_BYTES) return null
    val start = 6
    if (file.size < start + headerLength + MIN_BODY_LENGTH) return null
    val header =
      try {
        JSONObject(String(file, start, headerLength, Charsets.UTF_8))
      } catch (e: JSONException) {
        return null
      }
    val version = header.optInt("formatVersion", -1)
    if (version == -1) return null
    if (version != FORMAT_VERSION) throw VaultReadException(VaultReadException.Kind.UNSUPPORTED)
    if (header.optString("wrappedKey").isEmpty()) return null
    return start + headerLength
  }

  /**
   * Decrypts the vault body with [vaultKey] (32 bytes) using AES-256-GCM from the platform's
   * crypto provider. The caller must zero the returned array when done.
   */
  fun decrypt(file: ByteArray, vaultKey: ByteArray): ByteArray {
    val offset = bodyOffset(file) ?: throw VaultReadException(VaultReadException.Kind.DAMAGED)
    if (vaultKey.size != 32) throw VaultReadException(VaultReadException.Kind.WRONG_KEY)
    return try {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(
        Cipher.DECRYPT_MODE,
        SecretKeySpec(vaultKey, "AES"),
        GCMParameterSpec(TAG_BITS, file, offset, IV_LENGTH),
      )
      // Input is ciphertext followed by the 16-byte tag, which is the layout GCM expects.
      cipher.doFinal(file, offset + IV_LENGTH, file.size - offset - IV_LENGTH)
    } catch (e: GeneralSecurityException) {
      // A wrong key and a changed file are indistinguishable by design.
      throw VaultReadException(VaultReadException.Kind.WRONG_KEY)
    }
  }

  /**
   * Copies the saved logins out of the decrypted vault JSON. Entries that are not logins, and
   * entries in the Trash, are skipped. Everything else (notes, cards, custom fields, history,
   * 2FA secrets) is ignored and not kept. Unknown fields are ignored, so newer files still work.
   */
  fun parseLogins(plaintext: ByteArray): List<LoginRecord> {
    val root =
      try {
        JSONObject(String(plaintext, Charsets.UTF_8))
      } catch (e: JSONException) {
        throw VaultReadException(VaultReadException.Kind.DAMAGED)
      }
    if (root.optInt("version", -1) != DATA_VERSION) {
      throw VaultReadException(VaultReadException.Kind.UNSUPPORTED)
    }
    val entries = root.optJSONArray("entries") ?: throw VaultReadException(VaultReadException.Kind.DAMAGED)
    val out = ArrayList<LoginRecord>()
    for (i in 0 until entries.length()) {
      val e = entries.optJSONObject(i) ?: continue
      if (e.optString("type") != "login") continue
      if (e.has("deletedAt") && !e.isNull("deletedAt")) continue // in the Trash
      val id = e.optString("id")
      if (id.isEmpty()) continue
      out.add(
        LoginRecord(
          id = id,
          title = e.optString("title"),
          username = e.optString("username"),
          password = e.optString("password"),
          urls = strings(e.optJSONArray("urls")),
          appLinks = links(e.optJSONArray("appLinks")),
        )
      )
    }
    return out
  }

  private fun strings(array: JSONArray?): List<String> {
    if (array == null) return emptyList()
    return (0 until array.length()).mapNotNull { array.optString(it).takeIf { s -> s.isNotEmpty() } }
  }

  private fun links(array: JSONArray?): List<AppLink> {
    if (array == null) return emptyList()
    return (0 until array.length()).mapNotNull { i ->
      val o = array.optJSONObject(i) ?: return@mapNotNull null
      val pkg = o.optString("packageName")
      val cert = o.optString("certSha256")
      if (pkg.isEmpty() || cert.isEmpty()) null else AppLink(pkg, cert)
    }
  }

  /** Overwrites [bytes] with zeros. */
  fun wipe(bytes: ByteArray?) {
    if (bytes != null) Arrays.fill(bytes, 0)
  }
}
