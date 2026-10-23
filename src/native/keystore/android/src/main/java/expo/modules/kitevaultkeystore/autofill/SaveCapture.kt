package expo.modules.kitevaultkeystore.autofill

/**
 * Decides what, if anything, to remember when Android says "the user just submitted a form".
 *
 * In simple words: it takes what was typed and answers three questions. Is there a password
 * worth saving (typed, not blank, and a "confirm" box agrees with it)? Who was it typed for (a
 * known browser on an https page, or a particular app)? And is that origin trustworthy enough to
 * be saved under? Only then does it produce a [NewSave]. It uses the same strict origin rules as
 * filling, so a page that mixes sites, or a plain http page, is never saved.
 *
 * It never decides to SAVE: it only prepares what the user will be asked to confirm inside the app.
 */
internal object SaveCapture {
  private const val MAX_PASSWORD = 1024
  private const val MAX_USERNAME = 512

  fun capture(
    screen: ParsedScreen,
    values: List<String?>,
    fromTrustedBrowser: Boolean,
    appLabel: (String) -> String?,
    appCertificates: (String) -> AppCertificates?,
  ): NewSave? {
    val form = FieldClassifier.findSaveForm(screen.fields, values) ?: return null
    val password = values.getOrNull(form.password.index).orEmpty()
    val username = form.username?.let { values.getOrNull(it.index) }.orEmpty().trim()
    if (password.isEmpty() || password.length > MAX_PASSWORD || username.length > MAX_USERNAME) return null

    // A page that shows boxes from more than one site (a frame from another site, say) is never
    // saved, even if the box that was picked looks fine: the user could be misled about which
    // site the typed text belongs to.
    if (fromTrustedBrowser) {
      val host = form.password.webDomain?.let { DomainMatcher.normalizeHost(it) }
      val mixed =
        screen.fields.any { f ->
          f.isUsable && f.webDomain != null && DomainMatcher.normalizeHost(f.webDomain) != host
        }
      if (mixed) return null
    }

    val result = RequestOrigin.decide(screen, form, fromTrustedBrowser)
    val origin = (result as? OriginResult.Known)?.origin ?: return null
    return noteFor(origin, username, password, appLabel, appCertificates)
  }

  /**
   * The note kept for a password that KiteVault suggested and the person chose, until the sign-up
   * is saved or ten minutes pass. There is no user name yet (it is not typed). When the sign-up
   * is submitted, the normal save for the same password replaces this note.
   */
  fun forSuggestion(
    origin: Origin,
    password: String,
    appLabel: (String) -> String?,
    appCertificates: (String) -> AppCertificates?,
  ): NewSave? {
    if (password.isEmpty() || password.length > MAX_PASSWORD) return null
    return noteFor(origin, "", password, appLabel, appCertificates)
  }

  private fun noteFor(
    origin: Origin,
    username: String,
    password: String,
    appLabel: (String) -> String?,
    appCertificates: (String) -> AppCertificates?,
  ): NewSave? =
    when (origin) {
      is Origin.Web -> NewSave(SaveKind.WEB, username, password, origin.host, null, null, null)
      is Origin.App -> {
        // Without the app's certificate a later fill could not be matched safely: do not save.
        val cert = appCertificates(origin.packageName)?.current?.sorted()?.firstOrNull()
        if (cert == null) null
        else
          NewSave(
            SaveKind.APP,
            username,
            password,
            null,
            origin.packageName,
            appLabel(origin.packageName) ?: origin.packageName,
            cert,
          )
      }
    }
}
