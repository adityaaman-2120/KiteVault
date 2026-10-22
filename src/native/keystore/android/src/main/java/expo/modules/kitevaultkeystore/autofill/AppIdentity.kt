package expo.modules.kitevaultkeystore.autofill

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import java.security.MessageDigest

/**
 * Asks Android who an installed app really is.
 *
 * In simple words: anyone can name their app "Chase" or "Instagram". What they cannot fake is the
 * signing certificate: the digital signature the app developer put on the app. This class reads
 * the app's name (only to show to the user) and its certificate fingerprints (to compare with what
 * the user linked or with our list of known browsers).
 */
internal object AppIdentity {
  /** The app's display name, or null if the package is not visible/installed. Show it, never trust it. */
  @Suppress("DEPRECATION")
  fun label(context: Context, packageName: String): String? =
    try {
      val pm = context.packageManager
      pm.getApplicationLabel(pm.getApplicationInfo(packageName, 0)).toString()
    } catch (e: PackageManager.NameNotFoundException) {
      null
    }

  /**
   * The SHA-256 fingerprints (upper-case hex) of the certificates that signed the app: those
   * signing it now, and the older ones it replaced through Android's proof-of-rotation. Null if
   * the app cannot be found.
   */
  @Suppress("DEPRECATION")
  fun certificates(context: Context, packageName: String): AppCertificates? =
    try {
      val pm = context.packageManager
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        val info = pm.getPackageInfo(packageName, PackageManager.GET_SIGNING_CERTIFICATES)
        val signing = info.signingInfo
        if (signing == null) {
          null
        } else {
          val current = signing.apkContentsSigners.map { fingerprint(it.toByteArray()) }.toSet()
          val history =
            if (signing.hasMultipleSigners()) current
            else signing.signingCertificateHistory.map { fingerprint(it.toByteArray()) }.toSet()
          AppCertificates(current, history)
        }
      } else {
        val info = pm.getPackageInfo(packageName, PackageManager.GET_SIGNATURES)
        val current = info.signatures?.map { fingerprint(it.toByteArray()) }?.toSet() ?: emptySet()
        AppCertificates(current, current)
      }
    } catch (e: PackageManager.NameNotFoundException) {
      null
    }

  private fun fingerprint(certificate: ByteArray): String =
    MessageDigest.getInstance("SHA-256").digest(certificate).joinToString("") { "%02X".format(it) }
}
