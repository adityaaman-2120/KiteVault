package expo.modules.kitevaultkeystore.autofill

/** Who is asking for a login. */
internal sealed interface Origin {
  /** A web page shown by a trusted browser. [host] is already normalized (lower-case, ASCII). */
  data class Web(val host: String) : Origin

  /** A normal app, identified by its package name (its signing certificate is checked later). */
  data class App(val packageName: String) : Origin
}

/** Why we refused to treat the screen as coming from a known site. */
internal enum class Refusal {
  /** The page is not on https: a network attacker could have changed it. */
  NOT_HTTPS,

  /** The boxes belong to different web sites (for example a form hidden in another site's frame). */
  MIXED_DOMAINS,

  /** A browser screen with no web address (the browser's own menus and so on). Nothing to offer. */
  NO_DOMAIN,
}

internal sealed interface OriginResult {
  data class Known(val origin: Origin) : OriginResult

  data class Refused(val reason: Refusal, val shownHost: String?) : OriginResult
}

/**
 * Works out who is asking, using only facts we can trust.
 *
 * In simple words: the web address is trusted ONLY when the screen belongs to a known browser
 * (checked by its package name and signing certificate). Any other app can write anything it likes
 * as the "web address" of its own views, so for ordinary apps we ignore the web address completely
 * and identify the app by its package name. For a browser page we also require https, and that
 * every box we would fill belongs to the very same site.
 */
internal object RequestOrigin {
  fun decide(screen: ParsedScreen, form: LoginForm, fromTrustedBrowser: Boolean): OriginResult {
    if (!fromTrustedBrowser) return OriginResult.Known(Origin.App(screen.packageName))

    val boxes = listOfNotNull(form.password, form.username)
    val host = form.password.webDomain?.let { DomainMatcher.normalizeHost(it) }
      ?: return OriginResult.Refused(Refusal.NO_DOMAIN, null)

    // Every box we would fill must say the same site. A missing or different one means the
    // page is mixing sites, so nothing is filled at all.
    for (box in boxes) {
      val boxHost = box.webDomain?.let { DomainMatcher.normalizeHost(it) }
      if (boxHost != host) return OriginResult.Refused(Refusal.MIXED_DOMAINS, host)
    }
    // An unknown scheme (older Android versions do not tell us) is treated like http.
    for (box in boxes) {
      if (!box.webScheme.equals("https", ignoreCase = true)) {
        return OriginResult.Refused(Refusal.NOT_HTTPS, host)
      }
    }
    return OriginResult.Known(Origin.Web(host))
  }
}
