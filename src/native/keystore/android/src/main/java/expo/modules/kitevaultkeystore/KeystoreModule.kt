package expo.modules.kitevaultkeystore

import android.content.Context
import android.security.keystore.KeyPermanentlyInvalidatedException
import androidx.biometric.BiometricManager
import androidx.fragment.app.FragmentActivity
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The bridge between JavaScript and the phone's secure hardware.
 *
 * Idea: the vault key (32 random bytes that decrypt the vault) is encrypted with a key that sits in
 * the Keystore and can only be used right after a fingerprint / face check. The encrypted copy is
 * saved in the app's private storage. To unlock, the user passes the check, the hardware decrypts
 * the vault key, and we hand it to JavaScript. Nothing readable is ever stored.
 */
class KeystoreModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val store: WrappedKeyStore
    get() = WrappedKeyStore(context)

  // Only one fingerprint dialog at a time.
  @Volatile private var promptInFlight = false

  override fun definition() = ModuleDefinition {
    Name("KitevaultKeystore")

    // Is there a usable Class 3 (strong) fingerprint / face sensor with something enrolled?
    Function("isBiometricAvailable") { biometricStatus() == BiometricManager.BIOMETRIC_SUCCESS }

    // "disabled" | "ready" | "reauth-required" | "invalidated" | "unavailable". Never shows a dialog.
    AsyncFunction("getUnlockState") { unlockState() }

    // Shows the dialog once, then stores the vault key encrypted under a new Keystore key.
    AsyncFunction("enableBiometricUnlock") { vaultKey: ByteArray, promise: Promise ->
      enable(vaultKey, promise)
    }

    // Shows the dialog and resolves with the vault key bytes.
    AsyncFunction("unlockWithBiometrics") { promise: Promise -> unlock(promise) }

    // Deletes the Keystore key, the stored blob and the counters.
    Function("disableBiometricUnlock") { disableInternal() }

    // Tell us the master password was just typed correctly: restarts the 7-day / 5-unlock counters.
    Function("recordPasswordUnlock") {
      if (store.hasBlob()) store.markPasswordEntered()
    }
  }

  private fun fragmentActivity(): FragmentActivity? = appContext.currentActivity as? FragmentActivity

  private fun biometricStatus(): Int =
    BiometricManager.from(context)
      .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)

  /** Why the master password is needed again, or null if biometrics are still allowed. */
  private fun policyReason(): BiometricPolicy.Reason? {
    val state = store.readPolicyState() ?: return BiometricPolicy.Reason.EXPIRED
    return BiometricPolicy.reauthReason(
      state,
      android.os.SystemClock.elapsedRealtime(),
      store.currentBootCount(),
    )
  }

  private fun disableInternal() {
    runCatching { KeystoreKeys.delete() }
    runCatching { store.deleteBlob() }
    runCatching { store.clearPolicyState() }
  }

  private fun unlockState(): String {
    if (!store.hasBlob() || !KeystoreKeys.exists()) return "disabled"
    if (policyReason() != null) return "reauth-required"

    val status = biometricStatus()
    if (status == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED ||
      status == BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE
    ) {
      return "unavailable"
    }

    val blob = store.readBlob() ?: return "invalidated"
    val key = KeystoreKeys.get() ?: return "invalidated"
    return try {
      // Preparing a cipher needs no fingerprint, but fails if the biometrics changed.
      KeystoreKeys.decryptCipher(key, blob.iv)
      "ready"
    } catch (e: KeyPermanentlyInvalidatedException) {
      "invalidated"
    } catch (e: Exception) {
      "invalidated"
    }
  }

  private fun enable(vaultKey: ByteArray, promise: Promise) {
    fun fail(code: String, message: String) {
      vaultKey.fill(0)
      promise.reject(code, message, null)
    }

    val activity = fragmentActivity() ?: return fail(ErrorCode.NO_ACTIVITY, "No screen is showing.")
    if (biometricStatus() != BiometricManager.BIOMETRIC_SUCCESS) {
      return fail(ErrorCode.UNAVAILABLE, "No strong biometrics are set up on this device.")
    }
    if (promptInFlight) return fail(ErrorCode.BUSY, "A biometric prompt is already open.")

    val cipher =
      try {
        disableInternal() // start clean: an old key or blob must never be mixed with a new one
        KeystoreKeys.encryptCipher(KeystoreKeys.create())
      } catch (e: Exception) {
        disableInternal()
        return fail(ErrorCode.INTERNAL, "Could not create the secure key.")
      }

    promptInFlight = true
    BiometricPrompter.authenticate(
      activity,
      cipher,
      title = "Turn on biometric unlock",
      subtitle = "Confirm to protect your vault with your fingerprint or face.",
      negativeButton = "Cancel",
    ) { result ->
      promptInFlight = false
      when (result) {
        is PromptResult.Success ->
          try {
            val encrypted = result.cipher.doFinal(vaultKey)
            store.writeBlob(result.cipher.iv, encrypted)
            store.markPasswordEntered()
            vaultKey.fill(0)
            promise.resolve(null)
          } catch (e: Exception) {
            disableInternal()
            fail(ErrorCode.INTERNAL, "Could not save the encrypted key.")
          }
        is PromptResult.Failure -> {
          disableInternal() // a half-finished setup must not leave a usable key behind
          fail(result.code, result.message)
        }
      }
    }
  }

  private fun unlock(promise: Promise) {
    fun fail(code: String, message: String) = promise.reject(code, message, null)

    val activity = fragmentActivity() ?: return fail(ErrorCode.NO_ACTIVITY, "No screen is showing.")
    if (!store.hasBlob() || !KeystoreKeys.exists()) {
      return fail(ErrorCode.NOT_ENABLED, "Biometric unlock is not turned on.")
    }

    val reason = policyReason()
    if (reason != null) return fail(ErrorCode.REAUTH_REQUIRED, reason.name)

    val status = biometricStatus()
    if (status == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED ||
      status == BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE
    ) {
      disableInternal()
      return fail(ErrorCode.UNAVAILABLE, "Biometrics were removed from this device.")
    }
    if (status != BiometricManager.BIOMETRIC_SUCCESS) {
      return fail(ErrorCode.UNAVAILABLE, "Biometrics are temporarily unavailable.")
    }

    val blob = store.readBlob()
    val key = KeystoreKeys.get()
    if (blob == null || key == null) {
      disableInternal()
      return fail(ErrorCode.KEY_INVALIDATED, "The stored key is no longer available.")
    }

    val cipher =
      try {
        KeystoreKeys.decryptCipher(key, blob.iv)
      } catch (e: KeyPermanentlyInvalidatedException) {
        disableInternal()
        return fail(ErrorCode.KEY_INVALIDATED, "Your biometrics changed.")
      } catch (e: Exception) {
        disableInternal()
        return fail(ErrorCode.KEY_INVALIDATED, "The stored key could not be used.")
      }

    if (promptInFlight) return fail(ErrorCode.BUSY, "A biometric prompt is already open.")
    promptInFlight = true
    BiometricPrompter.authenticate(
      activity,
      cipher,
      title = "Unlock KiteVault",
      subtitle = "Use your fingerprint or face.",
      negativeButton = "Use master password",
    ) { result ->
      promptInFlight = false
      when (result) {
        is PromptResult.Success ->
          try {
            val vaultKey = result.cipher.doFinal(blob.ciphertext)
            store.countBiometricUnlock() // saved before the key is handed over
            promise.resolve(vaultKey)
          } catch (e: Exception) {
            // The stored data does not decrypt: it was damaged or does not match the key.
            disableInternal()
            fail(ErrorCode.KEY_INVALIDATED, "The stored key could not be read.")
          }
        is PromptResult.Failure -> fail(result.code, result.message)
      }
    }
  }
}
