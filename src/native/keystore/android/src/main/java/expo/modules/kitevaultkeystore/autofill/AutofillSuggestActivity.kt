package expo.modules.kitevaultkeystore.autofill

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.service.autofill.Dataset
import android.view.WindowManager
import android.view.autofill.AutofillManager
import android.view.autofill.AutofillValue
import android.widget.TextView
import androidx.fragment.app.FragmentActivity

/**
 * The "Use strong password?" sheet shown on top of a sign-up page.
 *
 * In simple words, step by step:
 *  1. It gets the one-time ticket the service gave it. No ticket, or an old one: it closes.
 *  2. It makes a strong random password ([PasswordGenerator]) and shows it, naming the site or app.
 *  3. "Use password" fills it into the new-password box and the "confirm" box (and only those),
 *     and keeps a note of it for ten minutes so it is not lost if the page is never submitted.
 *     "Generate another" makes a new one. "Create my own" closes the sheet and fills nothing.
 *
 * No fingerprint is asked for: making a random password reveals nothing from the vault, and
 * nothing here reads the vault. Saving the password into the vault still needs the person to
 * unlock KiteVault and confirm, as for every other save.
 *
 * Like the unlock screen it cannot be started by other apps (it is not exported), hides itself
 * from screenshots and the recent-apps list, ignores taps while another window covers it, and
 * closes if the person leaves it. How it looks is [SheetUi]'s job.
 */
class AutofillSuggestActivity : FragmentActivity() {
  private var request: PendingSuggestion? = null
  private var password = ""
  private var options = PasswordOptions()
  private var done = false

  private val ui by lazy(LazyThreadSafetyMode.NONE) { SheetUi(this) }

  override fun onCreate(savedInstanceState: Bundle?) {
    // No screenshots, no recent-apps preview of this screen: it shows a password.
    window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
    super.onCreate(savedInstanceState)

    val pending = SuggestionRequests.registry.take(intent.getStringExtra(AutofillAuthActivity.EXTRA_TICKET))
    if (pending == null) {
      cancel() // unknown, used or expired ticket: do nothing at all
      return
    }
    request = pending
    options = GeneratorPrefs.load(this)
    password = PasswordGenerator.generate(options)
    buildScreen(pending)
  }

  // --- The screen -------------------------------------------------------------------------------

  private fun buildScreen(pending: PendingSuggestion) {
    // Tapping the dimmed area above the sheet closes it without filling anything.
    ui.install { cancel() }
    // Ignore taps while another window (an overlay) covers this one: stops tap-jacking.
    ui.root.filterTouchesWhenObscured = true
    ui.sheet.filterTouchesWhenObscured = true

    // A web address a trusted browser reported over https gets a green lock; an app's name is
    // only a label, so it gets an amber one.
    ui.showContext(pending.displayName, verified = pending.origin is Origin.Web)

    ui.reset()
    ui.title("Use strong password?")
    ui.body("KiteVault made this password for you. You won't need to remember it: after you sign up, KiteVault will offer to save it.")
    val box: TextView = ui.passwordBox(password)
    val summary: TextView = ui.passwordSummary(password)
    // Many sign-up pages cap the length or refuse symbols, so both can be changed here. The
    // choice is remembered for next time.
    ui.passwordOptions(options) { chosen ->
      options = chosen
      GeneratorPrefs.save(this, chosen)
      password = PasswordGenerator.generate(chosen)
      ui.setPassword(box, password)
      summary.text = AutofillStyle.passwordSummary(password)
    }
    ui.button("Use password", ButtonKind.PRIMARY) { usePassword() }
    ui.button("Generate another", ButtonKind.SECONDARY) {
      password = PasswordGenerator.generate(options)
      ui.setPassword(box, password)
      summary.text = AutofillStyle.passwordSummary(password)
    }
    ui.button("Create my own", ButtonKind.TEXT) { cancel() }
  }

  // --- Use it -----------------------------------------------------------------------------------

  private fun usePassword() {
    val pending = request ?: return
    if (done) return
    done = true

    // If the page is never submitted (it rejects the password, or the person leaves), the
    // password would exist nowhere else. So a note of it waits, encrypted, for ten minutes, and
    // the app offers to save it. If the sign-up goes through, Android's own "Save?" replaces it.
    keepForSaving(pending)

    // Only the new-password boxes found by the service are given a value. What is handed back is
    // a dataset, because the suggestion that was tapped was a locked dataset: Android fills a
    // dataset that comes back from this screen into the boxes right away, with no second tap.
    @Suppress("DEPRECATION")
    val dataset = Dataset.Builder()
    for (id in pending.passwordIds) dataset.setValue(id, AutofillValue.forText(password))
    setResult(Activity.RESULT_OK, Intent().putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, dataset.build()))
    clear()
    finish()
  }

  private fun keepForSaving(pending: PendingSuggestion) {
    val note =
      SaveCapture.forSuggestion(
        pending.origin,
        password,
        appLabel = { AppIdentity.label(this, it) },
        appCertificates = { AppIdentity.certificates(this, it) },
      ) ?: return
    // A problem here only means the safety copy is missing; the password is still filled in.
    runCatching { PendingSaves.store(this).add(note) }
  }

  private fun cancel() {
    done = true
    setResult(Activity.RESULT_CANCELED)
    clear()
    finish()
  }

  /** Forgets the password held by this screen. */
  private fun clear() {
    password = ""
    request = null
  }

  // Leaving the screen (home button, another app) ends the request.
  override fun onStop() {
    super.onStop()
    if (!done && !isChangingConfigurations) cancel()
  }

  override fun onDestroy() {
    clear()
    super.onDestroy()
  }
}
