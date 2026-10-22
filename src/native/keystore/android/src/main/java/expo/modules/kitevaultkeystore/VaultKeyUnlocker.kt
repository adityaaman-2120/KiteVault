package expo.modules.kitevaultkeystore

import android.content.Context
import android.os.SystemClock
import android.security.keystore.KeyPermanentlyInvalidatedException
import androidx.biometric.BiometricManager
import androidx.fragment.app.FragmentActivity
import java.util.concurrent.atomic.AtomicBoolean

/** The result of asking the user to unlock with their fingerprint or face. */
internal sealed class UnlockOutcome {
  /** The vault key (32 bytes). The receiver must zero it when finished. */
  class Key(val bytes: ByteArray) : UnlockOutcome()

  /** Nothing was unlocked. [code] is one of [ErrorCode]; [message] is safe to show. */
  class Failure(val code: String, val message: String) : UnlockOutcome()
}

/**
 * Turns "the user passed the fingerprint / face check" into "here is the vault key".
 *
 * In simple words: the vault key is stored scrambled by a key inside the phone's secure hardware.
 * The hardware only unscrambles it right after a successful fingerprint or face check. This class
 * runs that whole sequence: check the rules (restart / 7 days / 5 uses), prepare the hardware
 * key, show the system fingerprint dialog, and hand back the vault key. It is used by the app's
 * own unlock screen ([KeystoreModule]) and by autofill, so both follow exactly the same rules.
 */
internal class VaultKeyUnlocker(context: Context) {
  private val appContext = context.applicationContext
  private val store = WrappedKeyStore(appContext)

  /** Why the master password is needed again, or null if biometrics are still allowed. */
  fun policyReason(): BiometricPolicy.Reason? {
    val state = store.readPolicyState() ?: return BiometricPolicy.Reason.EXPIRED
    return BiometricPolicy.reauthReason(
      state,
      SystemClock.elapsedRealtime(),
      store.currentBootCount(),
    )
  }

  fun biometricStatus(): Int =
    BiometricManager.from(appContext)
      .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)

  /** Deletes the hardware key, the stored copy of the vault key and the counters. */
  fun disable() {
    runCatching { KeystoreKeys.delete() }
    runCatching { store.deleteBlob() }
    runCatching { store.clearPolicyState() }
  }

  /**
   * Shows the system dialog and reports the result through [onResult] (on the main thread).
   * Counts the unlock towards the 5-use limit before the key is handed out.
   */
  fun unlock(
    activity: FragmentActivity,
    title: String,
    subtitle: String,
    negativeButton: String,
    onResult: (UnlockOutcome) -> Unit,
  ) {
    fun fail(code: String, message: String) = onResult(UnlockOutcome.Failure(code, message))

    if (!store.hasBlob() || !KeystoreKeys.exists()) {
      return fail(ErrorCode.NOT_ENABLED, "Biometric unlock is not turned on.")
    }

    val reason = policyReason()
    if (reason != null) return fail(ErrorCode.REAUTH_REQUIRED, reason.name)

    val status = biometricStatus()
    if (status == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED ||
      status == BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE
    ) {
      disable()
      return fail(ErrorCode.UNAVAILABLE, "Biometrics were removed from this device.")
    }
    if (status != BiometricManager.BIOMETRIC_SUCCESS) {
      return fail(ErrorCode.UNAVAILABLE, "Biometrics are temporarily unavailable.")
    }

    val blob = store.readBlob()
    val key = KeystoreKeys.get()
    if (blob == null || key == null) {
      disable()
      return fail(ErrorCode.KEY_INVALIDATED, "The stored key is no longer available.")
    }

    val cipher =
      try {
        KeystoreKeys.decryptCipher(key, blob.iv)
      } catch (e: KeyPermanentlyInvalidatedException) {
        disable()
        return fail(ErrorCode.KEY_INVALIDATED, "Your biometrics changed.")
      } catch (e: Exception) {
        disable()
        return fail(ErrorCode.KEY_INVALIDATED, "The stored key could not be used.")
      }

    if (!promptInFlight.compareAndSet(false, true)) {
      return fail(ErrorCode.BUSY, "A biometric prompt is already open.")
    }
    BiometricPrompter.authenticate(
      activity,
      cipher,
      title = title,
      subtitle = subtitle,
      negativeButton = negativeButton,
    ) { result ->
      promptInFlight.set(false)
      when (result) {
        is PromptResult.Success ->
          try {
            val vaultKey = result.cipher.doFinal(blob.ciphertext)
            store.countBiometricUnlock() // saved before the key is handed over
            onResult(UnlockOutcome.Key(vaultKey))
          } catch (e: Exception) {
            // The stored data does not decrypt: it was damaged or does not match the key.
            disable()
            fail(ErrorCode.KEY_INVALIDATED, "The stored key could not be read.")
          }
        is PromptResult.Failure -> fail(result.code, result.message)
      }
    }
  }

  companion object {
    /** Only one fingerprint dialog at a time, across the app screen and autofill. */
    val promptInFlight = AtomicBoolean(false)
  }
}
