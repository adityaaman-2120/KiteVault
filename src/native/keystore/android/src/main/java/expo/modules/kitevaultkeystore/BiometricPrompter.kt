package expo.modules.kitevaultkeystore

import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import javax.crypto.Cipher

/** Error codes that JavaScript sees (as `error.code`). */
internal object ErrorCode {
  const val UNAVAILABLE = "ERR_BIOMETRIC_UNAVAILABLE"
  const val NOT_ENABLED = "ERR_BIOMETRIC_NOT_ENABLED"
  const val USER_CANCELED = "ERR_BIOMETRIC_USER_CANCELED"
  const val LOCKED_OUT = "ERR_BIOMETRIC_LOCKED_OUT"
  const val KEY_INVALIDATED = "ERR_BIOMETRIC_KEY_INVALIDATED"
  const val REAUTH_REQUIRED = "ERR_BIOMETRIC_REAUTH_REQUIRED"
  const val AUTH_FAILED = "ERR_BIOMETRIC_AUTH_FAILED"
  const val NO_ACTIVITY = "ERR_BIOMETRIC_NO_ACTIVITY"
  const val BUSY = "ERR_BIOMETRIC_BUSY"
  const val INTERNAL = "ERR_BIOMETRIC_INTERNAL"
}

internal sealed class PromptResult {
  /** The user passed the check; `cipher` is now allowed to run exactly once. */
  class Success(val cipher: Cipher) : PromptResult()

  class Failure(val code: String, val message: String) : PromptResult()
}

/** Shows the system fingerprint / face dialog and hands back an unlocked Cipher. */
internal object BiometricPrompter {
  fun authenticate(
    activity: FragmentActivity,
    cipher: Cipher,
    title: String,
    subtitle: String,
    negativeButton: String,
    onResult: (PromptResult) -> Unit,
  ) {
    // BiometricPrompt must be created and started on the main (UI) thread.
    activity.runOnUiThread {
      val callback =
        object : BiometricPrompt.AuthenticationCallback() {
          override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
            val unlocked = result.cryptoObject?.cipher
            if (unlocked == null) {
              onResult(PromptResult.Failure(ErrorCode.AUTH_FAILED, "No cipher returned."))
            } else {
              onResult(PromptResult.Success(unlocked))
            }
          }

          override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
            onResult(mapError(errorCode, errString.toString()))
          }

          // A finger that did not match: the dialog stays open and the user can retry,
          // so this is not a final result.
          override fun onAuthenticationFailed() {}
        }

      val prompt =
        BiometricPrompt(activity, ContextCompat.getMainExecutor(activity), callback)
      val info =
        BiometricPrompt.PromptInfo.Builder()
          .setTitle(title)
          .setSubtitle(subtitle)
          .setNegativeButtonText(negativeButton)
          // Class 3 only. With a crypto object, PIN / pattern is not allowed here.
          .setAllowedAuthenticators(androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG)
          .setConfirmationRequired(false)
          .build()
      prompt.authenticate(info, BiometricPrompt.CryptoObject(cipher))
    }
  }

  private fun mapError(errorCode: Int, message: String): PromptResult.Failure =
    when (errorCode) {
      BiometricPrompt.ERROR_USER_CANCELED,
      BiometricPrompt.ERROR_NEGATIVE_BUTTON,
      BiometricPrompt.ERROR_CANCELED ->
        PromptResult.Failure(ErrorCode.USER_CANCELED, "Biometric unlock was cancelled.")
      BiometricPrompt.ERROR_LOCKOUT,
      BiometricPrompt.ERROR_LOCKOUT_PERMANENT ->
        PromptResult.Failure(ErrorCode.LOCKED_OUT, "Too many failed biometric attempts.")
      BiometricPrompt.ERROR_NO_BIOMETRICS,
      BiometricPrompt.ERROR_HW_NOT_PRESENT,
      BiometricPrompt.ERROR_HW_UNAVAILABLE,
      BiometricPrompt.ERROR_NO_DEVICE_CREDENTIAL ->
        PromptResult.Failure(ErrorCode.UNAVAILABLE, "Biometrics are not available.")
      else -> PromptResult.Failure(ErrorCode.AUTH_FAILED, message)
    }
}
