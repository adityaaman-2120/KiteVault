package expo.modules.kitevaultkeystore

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import java.security.KeyStore
import java.security.ProviderException
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * The AES key that lives inside the phone's secure hardware (Android Keystore).
 *
 * The key material never leaves the hardware: we can only ask it to encrypt or decrypt, and only
 * right after the user's fingerprint / face was accepted.
 */
internal object KeystoreKeys {
  // Fixed name so a later feature (the Autofill service) in the same app can find the same key.
  const val ALIAS = "kitevault_biometric_key_v1"
  private const val ANDROID_KEYSTORE = "AndroidKeyStore"
  private const val TRANSFORMATION = "AES/GCM/NoPadding"
  const val GCM_TAG_BITS = 128

  private fun keyStore(): KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

  fun exists(): Boolean = keyStore().containsAlias(ALIAS)

  /** Returns the key, or null if it was deleted (for example by the system). */
  fun get(): SecretKey? = keyStore().getKey(ALIAS, null) as? SecretKey

  fun delete() {
    val store = keyStore()
    if (store.containsAlias(ALIAS)) store.deleteEntry(ALIAS)
  }

  /** Creates a fresh key, replacing any old one. Tries StrongBox first, then the normal TEE. */
  fun create(): SecretKey {
    delete()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      try {
        return generate(strongBox = true)
      } catch (e: StrongBoxUnavailableException) {
        // This phone has no StrongBox chip: use the regular secure environment instead.
      } catch (e: ProviderException) {
        // Some phones report a missing StrongBox this way instead.
      }
      delete() // make sure a half-created key does not linger
    }
    return generate(strongBox = false)
  }

  private fun generate(strongBox: Boolean): SecretKey {
    val spec =
      KeyGenParameterSpec.Builder(
          ALIAS,
          KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
        .setKeySize(256)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        // Every single use needs a fresh fingerprint / face check.
        .setUserAuthenticationRequired(true)
        // Adding a new fingerprint / face makes this key permanently unusable.
        .setInvalidatedByBiometricEnrollment(true)
        .apply {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Timeout 0 = authenticate every time; BIOMETRIC_STRONG = Class 3 only (no PIN/pattern).
            setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
          } else {
            @Suppress("DEPRECATION") setUserAuthenticationValidityDurationSeconds(-1)
          }
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            setUnlockedDeviceRequired(true)
            if (strongBox) setIsStrongBoxBacked(true)
          }
        }
        .build()

    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
      .apply { init(spec) }
      .generateKey()
  }

  /** A cipher ready to encrypt. Android picks a random IV for us (read it from `cipher.iv`). */
  fun encryptCipher(key: SecretKey): Cipher =
    Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, key) }

  /**
   * A cipher ready to decrypt with the IV that was stored next to the data. Throws
   * KeyPermanentlyInvalidatedException if the biometrics changed since the key was made.
   */
  fun decryptCipher(key: SecretKey, iv: ByteArray): Cipher =
    Cipher.getInstance(TRANSFORMATION).apply {
      init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(GCM_TAG_BITS, iv))
    }
}
