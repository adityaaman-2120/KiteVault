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

  // The fingerprint rules and dialog are shared with autofill (see VaultKeyUnlocker).
  private val unlocker: VaultKeyUnlocker
    get() = VaultKeyUnlocker(context)

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
  private fun policyReason(): BiometricPolicy.Reason? = unlocker.policyReason()

  private fun disableInternal() = unlocker.disable()

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
    if (VaultKeyUnlocker.promptInFlight.get()) {
      return fail(ErrorCode.BUSY, "A biometric prompt is already open.")
    }

    val cipher =
      try {
        disableInternal() // start clean: an old key or blob must never be mixed with a new one
        KeystoreKeys.encryptCipher(KeystoreKeys.create())
      } catch (e: Exception) {
        disableInternal()
        return fail(ErrorCode.INTERNAL, "Could not create the secure key.")
      }

    VaultKeyUnlocker.promptInFlight.set(true)
    BiometricPrompter.authenticate(
      activity,
      cipher,
      title = "Turn on biometric unlock",
      subtitle = "Confirm to protect your vault with your fingerprint or face.",
      negativeButton = "Cancel",
    ) { result ->
      VaultKeyUnlocker.promptInFlight.set(false)
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
    val activity =
      fragmentActivity()
        ?: return promise.reject(ErrorCode.NO_ACTIVITY, "No screen is showing.", null)

    unlocker.unlock(
      activity,
      title = "Unlock KiteVault",
      subtitle = "Use your fingerprint or face.",
      negativeButton = "Use master password",
    ) { outcome ->
      when (outcome) {
        is UnlockOutcome.Key -> promise.resolve(outcome.bytes)
        is UnlockOutcome.Failure -> promise.reject(outcome.code, outcome.message, null)
      }
    }
  }
}
