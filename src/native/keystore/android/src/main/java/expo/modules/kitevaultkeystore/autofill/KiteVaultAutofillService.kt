package expo.modules.kitevaultkeystore.autofill

import android.app.PendingIntent
import android.app.assist.AssistStructure
import android.content.Intent
import android.os.Build
import android.os.CancellationSignal
import android.service.autofill.AutofillService
import android.service.autofill.FillCallback
import android.service.autofill.FillRequest
import android.service.autofill.FillResponse
import android.service.autofill.SaveCallback
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
 * Nothing is ever filled by this class. Saving new logins is not part of this version.
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

  /** Returns the locked suggestion, or null when this screen is not a sign-in form we handle. */
  private fun buildResponse(structure: AssistStructure): FillResponse? {
    val parsed = StructureParser.parse(structure)
    val form = FieldClassifier.findLoginForm(parsed.screen.fields) ?: return null

    val ownerPackage = parsed.screen.packageName
    if (ownerPackage.isEmpty()) return null
    val fromBrowser = TrustedBrowsers.isTrusted(this, ownerPackage)
    val origin = RequestOrigin.decide(parsed.screen, form, fromBrowser)

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

    val passwordId: AutofillId = parsed.ids[form.password.index]
    val usernameId: AutofillId? = form.username?.let { parsed.ids[it.index] }

    val ticket =
      FillRequests.registry.put(PendingFill(origin, ownerPackage, displayName, passwordId, usernameId))

    val intent = Intent(this, AutofillAuthActivity::class.java)
      .putExtra(AutofillAuthActivity.EXTRA_TICKET, ticket)
    // Android adds its own extras to this intent, so it must be mutable on Android 12 and newer.
    // The intent is explicit (our own class) and carries only a random one-time ticket.
    var flags = PendingIntent.FLAG_CANCEL_CURRENT
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags = flags or PendingIntent.FLAG_MUTABLE
    val sender = PendingIntent.getActivity(this, ticket.hashCode(), intent, flags).intentSender

    // The text of the suggestion is fixed. It does not contain the web address or any account.
    val presentation = RemoteViews(packageName, R.layout.kitevault_autofill_locked_item)

    val ids = listOfNotNull(passwordId, usernameId).toTypedArray()
    @Suppress("DEPRECATION")
    return FillResponse.Builder().setAuthentication(ids, sender, presentation).build()
  }

  /** Saving logins is added in a later step, so for now a save request is simply acknowledged. */
  override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
    callback.onSuccess()
  }
}
