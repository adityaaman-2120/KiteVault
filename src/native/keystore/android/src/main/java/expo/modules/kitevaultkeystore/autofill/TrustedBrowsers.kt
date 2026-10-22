package expo.modules.kitevaultkeystore.autofill

import android.content.Context

/**
 * The short list of browsers whose "this page is example.com" statement we believe.
 *
 * In simple words: a normal app can claim that one of its screens shows any web address it likes.
 * Only a real browser can be believed about the page it is showing. So we only accept a web
 * address from a browser on this list, and only if the browser's signing certificate is the real
 * one (a fake browser with the same package name would have a different certificate).
 * The list itself is in [TrustedBrowserData], generated from Google's published list of browsers.
 */
internal object TrustedBrowsers {
  /** Pure check, used by tests: [packageName] with exactly these signing certificates. */
  fun isTrusted(packageName: String, currentCertificates: Set<String>): Boolean {
    val allowed = TrustedBrowserData.certificatesByPackage[packageName] ?: return false
    return currentCertificates.isNotEmpty() && allowed.containsAll(currentCertificates)
  }

  fun isTrusted(context: Context, packageName: String): Boolean {
    if (packageName !in TrustedBrowserData.certificatesByPackage) return false
    val certs = AppIdentity.certificates(context, packageName) ?: return false
    return isTrusted(packageName, certs.current)
  }
}
