package expo.modules.kitevaultkeystore.autofill

import android.app.PendingIntent
import android.app.assist.AssistStructure
import android.content.Intent
import android.content.IntentSender
import android.os.Build
import android.os.CancellationSignal
import android.service.autofill.AutofillService
import android.service.autofill.Dataset
import android.service.autofill.FillCallback
import android.service.autofill.FillRequest
import android.service.autofill.FillResponse
import android.service.autofill.SaveCallback
import android.service.autofill.SaveInfo
import android.service.autofill.SaveRequest
import android.view.autofill.AutofillId
import android.widget.RemoteViews
import expo.modules.kitevaultkeystore.R
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * The autofill service: the part Android calls when the user taps a login box in another app.
 *
 * In simple words: when the user taps a user-name or password box, Android asks every autofill
 * service "can you help?". This class looks at the screen, decides whether it is a sign-in form
 * and WHO is asking (a known browser showing a web page, or an app), and answers with ONE locked
 * suggestion: "Unlock KiteVault to fill". It never reads the vault and never shows any account
 * names, so nothing private appears before the user proves it is them with a fingerprint or face.
 * Only if the user taps the suggestion does Android open [AutofillAuthActivity], which does the
 * unlocking and returns the matching login.
 *
 * On a sign-up form (a NEW password box) it instead answers with "Suggest strong password",
 * which opens [AutofillSuggestActivity]. That screen makes a random password and nothing else:
 * no vault data is involved, so no fingerprint is needed.
 *
 * Nothing is ever filled by this class. It also handles "save": see [onSaveRequest].
 */
class KiteVaultAutofillService : AutofillService() {
  // Android calls us on the main thread; looking through a big screen is done on this one.
  private val worker = Executors.newSingleThreadExecutor()

  override fun onDestroy() {
    worker.shutdownNow()
    super.onDestroy()
  }

  override fun onFillRequest(
    request: FillRequest,
    cancellationSignal: CancellationSignal,
    callback: FillCallback,
  ) {
    val cancelled = AtomicBoolean(false)
    cancellationSignal.setOnCancelListener { cancelled.set(true) }
    val structure = request.fillContexts.lastOrNull()?.structure
    if (structure == null) {
      callback.onSuccess(null)
      return
    }
    worker.execute {
      // Any problem simply means "no suggestion". The error is not logged: it could contain
      // details of the other app's screen.
      val response = try { buildResponse(structure) } catch (e: Exception) { null }
      if (!cancelled.get()) callback.onSuccess(response)
    }
  }

  /**
   * Returns the answer for this screen: the locked suggestion (plus the offer to save), only the
   * offer to save (a sign-up form, where there is nothing to fill yet), or null (nothing to do).
   */
  private fun buildResponse(structure: AssistStructure): FillResponse? {
    val parsed = StructureParser.parse(structure)
    val ownerPackage = parsed.screen.packageName
    if (ownerPackage.isEmpty()) return null
    // KiteVault's own screens (the master password, the unlock card) are never filled or saved.
    if (ownerPackage == packageName) return null
    val fromBrowser = TrustedBrowsers.isTrusted(this, ownerPackage)

    // The form to offer to save: sign-in, sign-up or change-password. Only offered when we know
    // exactly who is asking (otherwise a later save would be refused anyway).
    val saveForm = FieldClassifier.findSaveForm(parsed.screen.fields)
    val saveInfo =
      saveForm
        ?.takeIf { RequestOrigin.decide(parsed.screen, it, fromBrowser) is OriginResult.Known }
        ?.let { SaveInfos.forForm(parsed.ids[it.password.index], it.username?.let { u -> parsed.ids[u.index] }) }

    val form = FieldClassifier.findLoginForm(parsed.screen.fields)
    if (form == null) {
      // A sign-up or change-password form: KiteVault can suggest a strong password, and the new
      // login can be saved afterwards.
      val suggestion = saveForm?.let { suggestionResponse(parsed, it, fromBrowser, saveInfo) }
      if (suggestion != null) return suggestion
      if (saveInfo != null) return FillResponse.Builder().setSaveInfo(saveInfo).build()
      // No password box at all: the first page of a sign-in that asks for the user name first.
      val step = FieldClassifier.findUsernameStep(parsed.screen.fields) ?: return null
      return lockedFillResponse(parsed, fromBrowser, password = null, username = step, saveInfo = null, allowSuggest = false)
    }

    // On a page that also has a box for a NEW password (a change-password page) the tapped box
    // holds the old password, so no strong password is offered there.
    val allowSuggest = !FieldClassifier.hasNewPasswordBox(parsed.screen.fields)
    return lockedFillResponse(parsed, fromBrowser, form.password, form.username, saveInfo, allowSuggest)
  }

  /**
   * The ONE locked suggestion, "Unlock KiteVault to fill", for the given boxes (a password box,
   * a user-name box, or both). Returns null when a browser screen has no web address at all.
   */
  private fun lockedFillResponse(
    parsed: ParsedRequest,
    fromBrowser: Boolean,
    password: FieldNode?,
    username: FieldNode?,
    saveInfo: SaveInfo?,
    allowSuggest: Boolean,
  ): FillResponse? {
    val ownerPackage = parsed.screen.packageName
    val origin = RequestOrigin.decideFor(parsed.screen, listOfNotNull(password, username), fromBrowser)

    val displayName =
      when (origin) {
        is OriginResult.Known ->
          when (val o = origin.origin) {
            is Origin.Web -> o.host
            is Origin.App -> AppIdentity.label(this, o.packageName) ?: o.packageName
          }
        is OriginResult.Refused -> {
          // A browser screen without any web address (menus and so on): nothing to offer.
          if (origin.reason == Refusal.NO_DOMAIN) return null
          origin.shownHost ?: ownerPackage
        }
      }

    val passwordId: AutofillId? = password?.let { parsed.ids[it.index] }
    val usernameId: AutofillId? = username?.let { parsed.ids[it.index] }

    val ticket =
      FillRequests.registry.put(
        PendingFill(origin, ownerPackage, displayName, passwordId, usernameId, allowSuggest)
      )

    val sender = screenSender(AutofillAuthActivity::class.java, ticket)

    // The text of the suggestion is fixed. It does not contain the web address or any account.
    val presentation = RemoteViews(packageName, R.layout.kitevault_autofill_locked_item)

    val ids = listOfNotNull(passwordId, usernameId)
    return lockedAnswer(ids, sender, presentation, saveInfo)
  }

  /**
   * The answer: ONE suggestion that is locked behind its own unlock step, with no value in it.
   *
   * It is a dataset that carries its own authentication (not an authentication for the whole
   * answer) on purpose. When the unlock screen hands a dataset back, Android fills it into the
   * boxes straight away. When the unlock screen hands back a whole answer instead, Chrome shows it
   * as a second list item and the person has to tap it again.
   */
  private fun lockedAnswer(
    ids: List<AutofillId>,
    sender: IntentSender,
    presentation: RemoteViews,
    saveInfo: SaveInfo?,
  ): FillResponse {
    @Suppress("DEPRECATION")
    val locked = Dataset.Builder(presentation)
    // A box with no value yet: it only says "this suggestion is for this box".
    for (id in ids) locked.setValue(id, null)
    locked.setAuthentication(sender)
    return FillResponse.Builder()
      .addDataset(locked.build())
      .apply { saveInfo?.let { setSaveInfo(it) } }
      .build()
  }

  /**
   * The answer for a sign-up or change-password form: ONE locked suggestion, "Suggest strong
   * password". It contains no password and no page text; the password is made only if the person
   * taps it, on [AutofillSuggestActivity]. Returns null (so only the offer to save remains) when
   * we do not know exactly who is asking, or when no usable new-password box exists.
   */
  private fun suggestionResponse(
    parsed: ParsedRequest,
    saveForm: LoginForm,
    fromBrowser: Boolean,
    saveInfo: SaveInfo?,
  ): FillResponse? {
    val origin =
      (RequestOrigin.decide(parsed.screen, saveForm, fromBrowser) as? OriginResult.Known)?.origin
        ?: return null
    val newBoxes = FieldClassifier.findNewPasswordBoxes(parsed.screen.fields)
    if (newBoxes.isEmpty()) return null
    // Every box that would be filled must belong to the very same site.
    if (origin is Origin.Web) {
      val sameSite = newBoxes.all { it.webDomain?.let { d -> DomainMatcher.normalizeHost(d) } == origin.host }
      if (!sameSite) return null
    }
    val ids = newBoxes.map { parsed.ids[it.index] }
    val displayName =
      when (origin) {
        is Origin.Web -> origin.host
        is Origin.App -> AppIdentity.label(this, origin.packageName) ?: origin.packageName
      }
    val ticket =
      SuggestionRequests.registry.put(
        PendingSuggestion(origin, parsed.screen.packageName, displayName, ids)
      )
    val sender = screenSender(AutofillSuggestActivity::class.java, ticket)
    // The text of the suggestion is fixed. It does not contain the web address or any account.
    val presentation = RemoteViews(packageName, R.layout.kitevault_autofill_suggest_item)
    return lockedAnswer(ids, sender, presentation, saveInfo)
  }

  /**
   * Opens one of KiteVault's own screens when the person taps a suggestion. The intent is
   * explicit (our own class) and carries only a random one-time ticket, nothing else.
   */
  private fun screenSender(screen: Class<*>, ticket: String): IntentSender {
    val intent = Intent(this, screen).putExtra(AutofillAuthActivity.EXTRA_TICKET, ticket)
    // Android adds its own extras to this intent, so it must be mutable on Android 12 and newer.
    var flags = PendingIntent.FLAG_CANCEL_CURRENT
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags = flags or PendingIntent.FLAG_MUTABLE
    return PendingIntent.getActivity(this, ticket.hashCode(), intent, flags).intentSender
  }

  /**
   * Android calls this after the user agreed to "Save to KiteVault?" for a submitted form.
   *
   * In simple words: we note the user name, password and WHO it was typed for (checked with the
   * same strict rules as filling), park them in the encrypted pending file, and ask Android to
   * open KiteVault. We do NOT touch the vault: the app asks the user to unlock, shows a
   * confirmation screen (edit the title, pick a folder, update an existing login) and only then
   * saves. The opening intent carries no data at all. Nothing is logged.
   */
  override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
    val structure = request.fillContexts.lastOrNull()?.structure
    if (structure == null) {
      callback.onSuccess()
      return
    }
    worker.execute {
      val parked = try { parkSave(structure) } catch (e: Exception) { false }
      // Android only logs a failure and never retries, so the answer is always "handled".
      val opener = if (parked) openAppSender() else null
      if (opener != null) callback.onSuccess(opener) else callback.onSuccess()
    }
  }

  private fun parkSave(structure: AssistStructure): Boolean {
    val parsed = StructureParser.parse(structure, withValues = true)
    val ownerPackage = parsed.screen.packageName
    if (ownerPackage.isEmpty()) return false
    // Never save what is typed into KiteVault itself (that would include the master password).
    if (ownerPackage == packageName) return false
    val save =
      SaveCapture.capture(
        parsed.screen,
        parsed.values,
        fromTrustedBrowser = TrustedBrowsers.isTrusted(this, ownerPackage),
        appLabel = { AppIdentity.label(this, it) },
        appCertificates = { AppIdentity.certificates(this, it) },
      ) ?: return false
    PendingSaves.store(this).add(save)
    return true
  }

  /** Opens KiteVault's main screen. The intent has no extras, so it can leak nothing. */
  private fun openAppSender(): IntentSender? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return null // older Androids cannot do this
    val launch = packageManager.getLaunchIntentForPackage(packageName) ?: return null
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return PendingIntent.getActivity(
        this,
        0,
        launch,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
      .intentSender
  }
}
