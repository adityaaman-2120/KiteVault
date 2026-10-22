package expo.modules.kitevaultkeystore.autofill

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.io.File
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * The Android Keystore key that scrambles the pending-save file.
 *
 * In simple words: a key kept inside the phone's secure hardware, which can only be used by this
 * app and only while the phone is unlocked. Unlike the vault key's hardware key, it does NOT ask
 * for a fingerprint, because the service has to be able to park a login while the user is busy
 * in another app. It therefore protects the file against someone copying the file or the app's
 * folder, not against code running inside KiteVault itself.
 */
internal class KeystoreSealer : Sealer {
  override fun seal(plain: ByteArray): ByteArray {
    val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, key()) }
    val iv = cipher.iv // chosen by the Keystore, fresh for every encryption
    return byteArrayOf(iv.size.toByte()) + iv + cipher.doFinal(plain)
  }

  override fun open(sealed: ByteArray): ByteArray? =
    try {
      val ivLength = sealed[0].toInt() and 0xFF
      val cipher =
        Cipher.getInstance(TRANSFORMATION).apply {
          init(Cipher.DECRYPT_MODE, existingKey() ?: return null, GCMParameterSpec(128, sealed, 1, ivLength))
        }
      cipher.doFinal(sealed, 1 + ivLength, sealed.size - 1 - ivLength)
    } catch (e: Exception) {
      null
    }

  fun deleteKey() {
    val store = keyStore()
    if (store.containsAlias(ALIAS)) store.deleteEntry(ALIAS)
  }

  private fun keyStore(): KeyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

  private fun existingKey(): SecretKey? = keyStore().getKey(ALIAS, null) as? SecretKey

  private fun key(): SecretKey = existingKey() ?: create()

  private fun create(): SecretKey {
    val spec =
      KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setKeySize(256)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .apply {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) setUnlockedDeviceRequired(true)
        }
        .build()
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
      .apply { init(spec) }
      .generateKey()
  }

  companion object {
    const val ALIAS = "kitevault_autofill_pending_v1"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
  }
}

/** The one pending-save store of the app (the service and the app screens share it). */
internal object PendingSaves {
  private const val FILE_NAME = "kitevault_autofill_pending.bin"
  private val random = SecureRandom()

  @Volatile private var instance: PendingSaveStore? = null

  fun store(context: Context): PendingSaveStore =
    instance
      ?: synchronized(this) {
        instance
          ?: PendingSaveStore(
              file = File(context.applicationContext.filesDir, FILE_NAME),
              sealer = KeystoreSealer(),
              newId = { ByteArray(16).also { random.nextBytes(it) }.joinToString("") { "%02x".format(it) } },
            )
            .also { instance = it }
      }

  /** Deletes every waiting login and the key that protected them. */
  fun wipeEverything(context: Context) {
    store(context).clear()
    runCatching { KeystoreSealer().deleteKey() }
  }
}
