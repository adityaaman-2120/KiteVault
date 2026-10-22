package expo.modules.kitevaultkeystore.autofill

/** An app that the user has told KiteVault belongs to a login. The certificate is "pinned". */
internal data class AppLink(val packageName: String, val certSha256: String)

/**
 * One saved login, with only the fields autofill needs. Secrets are Strings (they cannot be wiped
 * from memory); the object lives only as long as the autofill screen is open.
 */
internal class LoginRecord(
  val id: String,
  val title: String,
  val username: String,
  val password: String,
  val urls: List<String>,
  val appLinks: List<AppLink>,
)

/** The signing certificates of an installed app (SHA-256, upper-case hex without colons). */
internal data class AppCertificates(val current: Set<String>, val history: Set<String>)

/**
 * Chooses which saved logins may be offered to the asker. This is the one place that decides, and
 * it is strict:
 *  - A web page matches a login only by its saved web addresses (see [DomainMatcher]).
 *  - An app matches a login only if the user linked that app to it AND the app's signing
 *    certificate is still the one that was linked (so a look-alike or re-signed copy gets nothing).
 *  - Titles, user names and notes are never used.
 */
internal object LoginMatcher {
  const val MAX_RESULTS = 20

  fun match(
    origin: Origin,
    logins: List<LoginRecord>,
    psl: PublicSuffixList,
    appCerts: AppCertificates?,
  ): List<LoginRecord> {
    val hits =
      when (origin) {
        is Origin.Web ->
          logins.filter { login -> login.urls.any { DomainMatcher.matches(it, origin.host, psl) } }
        is Origin.App -> {
          if (appCerts == null) emptyList()
          else
            logins.filter { login ->
              login.appLinks.any { link ->
                link.packageName == origin.packageName &&
                  normalizeCert(link.certSha256).let { it in appCerts.current || it in appCerts.history }
              }
            }
        }
      }
    return hits.sortedBy { it.title.lowercase() }.take(MAX_RESULTS)
  }

  /** Accepts "AB:CD:..." or "abcd..." and returns "ABCD...". */
  fun normalizeCert(text: String): String = text.replace(":", "").trim().uppercase()
}
