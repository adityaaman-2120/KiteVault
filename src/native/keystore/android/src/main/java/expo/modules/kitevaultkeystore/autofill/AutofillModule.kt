package expo.modules.kitevaultkeystore.autofill

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.view.autofill.AutofillManager
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The bridge that lets the app's screens (JavaScript) talk to autofill.
 *
 * In simple words, two jobs:
 *  1. Settings > Autofill asks "is KiteVault the phone's autofill service right now?" and opens
 *     Android's own page where the user picks it. The choice is always made by the user there.
 *  2. After the user agreed to save a login typed in another app, the app asks for the waiting
 *     logins (see [PendingSaveStore]), shows a confirmation screen once the vault is unlocked,
 *     saves them into the vault itself, and then tells us to delete each one.
 * This class never reads the vault and never holds a vault key.
 */
class AutofillModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("KitevaultAutofill")

    // { supported: this phone has autofill, enabled: KiteVault is the chosen autofill service }
    Function("getStatus") {
      val manager = context.getSystemService(AutofillManager::class.java)
      mapOf(
        "supported" to (manager?.isAutofillSupported == true),
        "enabled" to (manager?.hasEnabledAutofillServices() == true),
      )
    }

    // Opens Android's "choose autofill service" page for KiteVault. Returns false if the phone
    // has no such page (the general settings are opened instead).
    Function("openAutofillSettings") { openSettings() }

    // The logins waiting to be saved (oldest first). The app calls this only after the vault is
    // unlocked. Each is { id, createdAt, kind, username, password, host, packageName, label,
    // certSha256 }.
    AsyncFunction("getPendingSaves") {
      PendingSaves.store(context).list().map {
        val s = it.save
        mapOf(
          "id" to it.id,
          "createdAt" to it.createdAt.toDouble(),
          "kind" to s.kind.name,
          "username" to s.username,
          "password" to s.password,
          "host" to s.host,
          "packageName" to s.packageName,
          "label" to s.label,
          "certSha256" to s.certSha256,
        )
      }
    }

    // How many are waiting, without handing any of them out.
    AsyncFunction("getPendingSaveCount") { PendingSaves.store(context).list().size }

    // Deletes one waiting login (after it was saved, or when the user says no).
    AsyncFunction("discardPendingSave") { id: String -> PendingSaves.store(context).remove(id) }

    // Deletes all of them and the key that protected them (when the vault is erased).
    AsyncFunction("clearPendingSaves") { PendingSaves.wipeEverything(context) }
  }

  private fun openSettings(): Boolean {
    val ctx: Context = appContext.currentActivity ?: context
    val request =
      Intent(Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE)
        .setData(Uri.parse("package:${context.packageName}"))
    return try {
      start(ctx, request)
      true
    } catch (e: ActivityNotFoundException) {
      try {
        start(ctx, Intent(Settings.ACTION_SETTINGS))
      } catch (e2: ActivityNotFoundException) {
        // Nothing can open settings on this device.
      }
      false
    }
  }

  private fun start(ctx: Context, intent: Intent) {
    // From a non-activity context Android needs this flag; from an activity it is harmless.
    ctx.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }
}
