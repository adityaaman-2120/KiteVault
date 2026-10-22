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
 * The bridge that lets the app's screens (JavaScript) ask two things about autofill.
 *
 * In simple words: the Settings > Autofill screen needs to know "is KiteVault the phone's
 * autofill service right now?" and needs a button that opens Android's own page where the user
 * picks it. This class answers those two questions. It never touches the vault, the keys or any
 * login, and the choosing of the service is always done by the user in Android's settings.
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
