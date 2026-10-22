package expo.modules.kitevaultkeystore.autofill

import java.net.IDN

/**
 * Decides whether a saved web address and the page that is asking are the same site.
 *
 * In simple words: it is deliberately strict. A saved login for `example.com` is offered on
 * `example.com`, `www.example.com` and `login.example.com`, and nowhere else. It is NOT offered
 * on `example.com.evil.test`, `evilexample.com`, `example-com.test`, or a look-alike made with
 * foreign letters. There is no "similar title" or "contains the word" logic at all.
 */
internal object DomainMatcher {
  private val SCHEME = Regex("^([a-z][a-z0-9+.-]*)://")
  private val IPV4 = Regex("^\\d{1,3}(\\.\\d{1,3}){3}$")
  private val ALLOWED = Regex("^[a-z0-9_-]+(\\.[a-z0-9_-]+)*$")

  /**
   * Turns an address or host into a plain lower-case ASCII host, or null if it is not a usable
   * web address. Rules:
   *  - only `http`, `https` or no scheme at all (so `androidapp://...` is never a web address);
   *  - the path, query, port and any `user@` part are dropped;
   *  - non-English letters become their `xn--` form, so look-alike letters never equal the real name;
   *  - a leading `www.` and one trailing dot are dropped.
   */
  fun normalizeHost(raw: String): String? {
    var text = raw.trim().lowercase()
    if (text.isEmpty()) return null
    val scheme = SCHEME.find(text)
    if (scheme != null) {
      if (scheme.groupValues[1] != "http" && scheme.groupValues[1] != "https") return null
      text = text.substring(scheme.value.length)
    }
    text = text.substringBefore('/').substringBefore('?').substringBefore('#')
    text = text.substringAfterLast('@')
    if (text.startsWith("[")) return null // IPv6 addresses are never matched
    text = text.replace(Regex(":\\d+$"), "")
    text = text.removeSuffix(".")
    if (text.isEmpty()) return null
    val ascii =
      try {
        IDN.toASCII(text, IDN.ALLOW_UNASSIGNED).lowercase()
      } catch (e: IllegalArgumentException) {
        return null
      }
    if (!ALLOWED.matches(ascii)) return null
    return ascii.removePrefix("www.").ifEmpty { null }
  }

  fun isIpAddress(host: String): Boolean = IPV4.matches(host)

  /**
   * True if a login saved for [savedAddress] may be offered on the page whose host is
   * [requestHost] (already normalized with [normalizeHost]).
   *
   *  1. Same host: yes.
   *  2. [requestHost] is a sub-site of the saved host: yes, but only if the saved host is a name
   *     somebody registered (for example `example.com`), never a shared ending such as
   *     `github.io`, and never an address like `mail.example.com` (that one matches only itself).
   *  3. Anything else: no. Saved `login.example.com` is not offered on `example.com`.
   */
  fun matches(savedAddress: String, requestHost: String, psl: PublicSuffixList): Boolean {
    val saved = normalizeHost(savedAddress) ?: return false
    if (saved == requestHost) return true
    if (isIpAddress(saved) || isIpAddress(requestHost)) return false
    if (!requestHost.endsWith(".$saved")) return false
    return psl.registrableDomain(saved) == saved
  }
}
