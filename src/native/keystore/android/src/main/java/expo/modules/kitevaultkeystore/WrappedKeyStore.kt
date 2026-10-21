package expo.modules.kitevaultkeystore

import android.content.Context
import android.os.SystemClock
import android.provider.Settings
import android.util.AtomicFile
import java.io.File

/**
 * Where we keep (1) the encrypted vault key and (2) the counters used by BiometricPolicy.
 * Both live in the app's private storage, which other apps cannot read.
 *
 * The encrypted vault key is useless without the Keystore key, which needs the user's biometrics.
 */
internal class WrappedKeyStore(private val context: Context) {
  private val blobFile = File(context.filesDir, "kitevault_biometric_blob.bin")
  private val prefs = context.getSharedPreferences("kitevault_biometric_meta", Context.MODE_PRIVATE)

  class Blob(val iv: ByteArray, val ciphertext: ByteArray)

  fun hasBlob(): Boolean = blobFile.exists()

  /** File layout: [format 1][iv length][iv][ciphertext + GCM tag]. */
  fun writeBlob(iv: ByteArray, ciphertext: ByteArray) {
    require(iv.size in 1..255)
    val file = AtomicFile(blobFile) // writes to a temporary file, then swaps it in
    val out = file.startWrite()
    try {
      out.write(byteArrayOf(FORMAT_VERSION, iv.size.toByte()))
      out.write(iv)
      out.write(ciphertext)
      file.finishWrite(out)
    } catch (e: Throwable) {
      file.failWrite(out)
      throw e
    }
  }

  /** Returns null if there is no blob or it is malformed. */
  fun readBlob(): Blob? {
    if (!blobFile.exists()) return null
    val bytes = AtomicFile(blobFile).readFully()
    if (bytes.size < 2 || bytes[0] != FORMAT_VERSION) return null
    val ivLength = bytes[1].toInt() and 0xFF
    if (ivLength == 0 || bytes.size <= 2 + ivLength) return null
    return Blob(
      iv = bytes.copyOfRange(2, 2 + ivLength),
      ciphertext = bytes.copyOfRange(2 + ivLength, bytes.size),
    )
  }

  fun deleteBlob() {
    AtomicFile(blobFile).delete()
  }

  // --- Counters for BiometricPolicy -------------------------------------------------------

  fun readPolicyState(): BiometricPolicy.State? {
    if (!prefs.contains(KEY_PASSWORD_AT)) return null
    return BiometricPolicy.State(
      passwordEnteredAtElapsedMs = prefs.getLong(KEY_PASSWORD_AT, 0L),
      bootCount = prefs.getInt(KEY_BOOT_COUNT, BiometricPolicy.UNKNOWN_BOOT_COUNT),
      biometricUnlocks = prefs.getInt(KEY_UNLOCKS, 0),
    )
  }

  /** Called when the master password was just entered correctly: the counters start over. */
  fun markPasswordEntered() {
    writePolicyState(BiometricPolicy.State(SystemClock.elapsedRealtime(), currentBootCount(), 0))
  }

  fun countBiometricUnlock() {
    val state = readPolicyState() ?: return
    writePolicyState(state.copy(biometricUnlocks = state.biometricUnlocks + 1))
  }

  fun clearPolicyState() {
    prefs.edit().clear().commit()
  }

  fun currentBootCount(): Int =
    Settings.Global.getInt(
      context.contentResolver,
      Settings.Global.BOOT_COUNT,
      BiometricPolicy.UNKNOWN_BOOT_COUNT,
    )

  private fun writePolicyState(state: BiometricPolicy.State) {
    // commit() (not apply()) so the counter is on disk before we return the key to JavaScript.
    prefs
      .edit()
      .putLong(KEY_PASSWORD_AT, state.passwordEnteredAtElapsedMs)
      .putInt(KEY_BOOT_COUNT, state.bootCount)
      .putInt(KEY_UNLOCKS, state.biometricUnlocks)
      .commit()
  }

  private companion object {
    const val FORMAT_VERSION: Byte = 1
    const val KEY_PASSWORD_AT = "password_entered_at_elapsed_ms"
    const val KEY_BOOT_COUNT = "boot_count"
    const val KEY_UNLOCKS = "biometric_unlocks"
  }
}
