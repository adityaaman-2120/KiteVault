package expo.modules.kitevaultkeystore.autofill

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.service.autofill.Dataset
import android.text.Editable
import android.text.TextWatcher
import android.view.ViewGroup
import android.view.WindowManager
import android.view.autofill.AutofillManager
import android.view.autofill.AutofillValue
import android.widget.LinearLayout
import androidx.fragment.app.FragmentActivity
import expo.modules.kitevaultkeystore.ErrorCode
import expo.modules.kitevaultkeystore.R
import expo.modules.kitevaultkeystore.UnlockOutcome
import expo.modules.kitevaultkeystore.VaultKeyUnlocker
import java.util.concurrent.Executors

/**
 * The unlock-and-choose screen shown on top of the other app after the user taps "Unlock KiteVault
 * to fill".
 *
 * In simple words, step by step:
 *  1. It gets the one-time ticket the service gave it. No ticket, or an old one: it closes.
 *  2. It shows the system fingerprint / face dialog, naming who is asking.
 *  3. After the check it opens the vault (read only), picks the logins that match the website or
 *     app with the strict rules, and wipes the vault key.
 *  4. One match: it fills it. Several: the user picks. None: it says so, and the user may
 *     "Search my vault" and pick a login by hand, after a clear warning that it does not belong
 *     to this site or app.
 *  5. It gives the chosen user name and password to Android, which puts them into the two boxes
 *     (and only those two). Then it closes. On the first page of a two-page sign-in there is only
 *     a user-name box, and only the user name is filled.
 *
 * A page that does not say it is a sign-up looks like a sign-in, so a person creating an account
 * ends up here. So that nobody is stuck: if the fingerprint is cancelled or not available, and
 * when no login matches, KiteVault can make a strong password instead (see [showStrongPassword]),
 * which needs no fingerprint and reads nothing from the vault.
 *
 * It cannot be started by other apps (it is not exported), hides itself from screenshots and the
 * recent-apps list, ignores taps while another window covers it, and closes if the user leaves it.
 *
 * How it looks is [SheetUi]'s job; this class keeps the logic and the security settings.
 */
class AutofillAuthActivity : FragmentActivity() {
  private var fill: PendingFill? = null
  private var matches: List<LoginRecord> = emptyList()
  private var allLogins: List<LoginRecord> = emptyList()

  private val worker = Executors.newSingleThreadExecutor()
  private var waitingForBiometric = false
  private var done = false

  // A strong password made on request (see [showStrongPassword]); empty when there is none.
  private var suggested = ""
  private var options = PasswordOptions()

  // The list of logins on the search screen, so typing can redraw it; null on other screens.
  private var searchColumn: LinearLayout? = null

  private val ui by lazy(LazyThreadSafetyMode.NONE) { SheetUi(this) }

  override fun onCreate(savedInstanceState: Bundle?) {
    // No screenshots, no recent-apps preview of this screen.
    window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
    super.onCreate(savedInstanceState)

    val request = FillRequests.registry.take(intent.getStringExtra(EXTRA_TICKET))
    if (request == null) {
      cancel() // unknown, used or expired ticket: do nothing at all
      return
    }
    fill = request
    options = GeneratorPrefs.load(this)
    buildShell(request)

    val origin = request.origin
    if (origin is OriginResult.Refused && origin.reason == Refusal.MIXED_DOMAINS) {
      // Boxes from different sites on one page: nothing can be filled safely.
      showMessage(
        "KiteVault will not fill here",
        "This page mixes content from different websites, so it is not safe to fill a password.",
      )
      return
    }
    startUnlock()
  }

  /** Whether a strong password may be offered here: a known site or app, and a plain sign-in page. */
  private fun canSuggest(request: PendingFill): Boolean =
    request.allowSuggest && request.passwordId != null && request.origin is OriginResult.Known

  // --- Step 2: the fingerprint / face check ---------------------------------------------------

  private fun startUnlock() {
    val request = fill ?: return
    val who =
      if (request.origin is OriginResult.Known && request.origin.origin is Origin.App) {
        "${request.displayName} (${request.packageName})"
      } else request.displayName
    waitingForBiometric = true
    ui.reset()
    ui.loading("Unlocking KiteVault…")
    VaultKeyUnlocker(this).unlock(
      this,
      title = "Fill a login for $who",
      subtitle = "Use your fingerprint or face to unlock KiteVault.",
      negativeButton = "Cancel",
    ) { outcome ->
      waitingForBiometric = false
      when (outcome) {
        is UnlockOutcome.Key -> openVault(outcome.bytes)
        is UnlockOutcome.Failure -> showUnlockFailure(outcome.code)
      }
    }
  }

  private fun showUnlockFailure(code: String) {
    val request = fill ?: return
    when (code) {
      // Cancelling the fingerprint is how someone on a sign-up page says "I do not have a login
      // here". Do not just close: offer the way forward. Anywhere else, closing is right.
      ErrorCode.USER_CANCELED -> if (canSuggest(request)) showChoice(request) else cancel()
      ErrorCode.REAUTH_REQUIRED ->
        showProblem(
          request,
          "Unlock KiteVault first",
          "For your safety, KiteVault needs your master password again. Open KiteVault, unlock it with your master password, then try again.",
        )
      ErrorCode.NOT_ENABLED ->
        showProblem(
          request,
          "Turn on biometric unlock",
          "Filling a saved login needs fingerprint or face unlock. Open KiteVault, go to Settings and turn on biometric unlock.",
        )
      ErrorCode.KEY_INVALIDATED ->
        showProblem(
          request,
          "Unlock again in KiteVault",
          "Your fingerprints or face data changed, so KiteVault turned biometric unlock off. Open KiteVault and turn it on again.",
        )
      else -> showProblem(request, "Could not unlock", "KiteVault could not use your fingerprint or face. Try again.")
    }
  }

  /** The fingerprint did not work. A strong password does not need it, so it is still offered. */
  private fun showProblem(request: PendingFill, heading: String, text: String) {
    ui.reset()
    ui.message(R.drawable.kitevault_ic_warning, AutofillStyle.AMBER, heading, text)
    if (canSuggest(request)) {
      ui.button("Make a strong password instead", ButtonKind.PRIMARY) {
        showStrongPassword(request) { showProblem(request, heading, text) }
      }
      ui.button("Close", ButtonKind.TEXT) { cancel() }
    } else {
      ui.button("Close", ButtonKind.PRIMARY) { cancel() }
    }
  }

  /** The fingerprint was cancelled: fill a saved login, or make a strong password for a new account. */
  private fun showChoice(request: PendingFill) {
    ui.reset()
    ui.title("Fill with KiteVault")
    ui.body("Use your fingerprint to fill a saved login, or let KiteVault make a strong password for a new account.")
    ui.button("Use fingerprint", ButtonKind.PRIMARY) { startUnlock() }
    ui.button("Make a strong password", ButtonKind.SECONDARY) {
      showStrongPassword(request) { showChoice(request) }
    }
    ui.button("Close", ButtonKind.TEXT) { cancel() }
  }

  // --- Step 3: read the vault and find matches ------------------------------------------------

  private fun openVault(vaultKey: ByteArray) {
    val request = fill ?: return
    ui.reset()
    ui.loading("Opening your vault…")
    worker.execute {
      var plain: ByteArray? = null
      try {
        val file = VaultReader.readVaultFile(filesDir)
        plain = VaultReader.decrypt(file, vaultKey)
        val logins = VaultReader.parseLogins(plain)

        val matched =
          when (val origin = request.origin) {
            is OriginResult.Known -> {
              val certs =
                (origin.origin as? Origin.App)?.let { AppIdentity.certificates(this, it.packageName) }
              LoginMatcher.match(origin.origin, logins, loadSuffixList(), certs)
            }
            is OriginResult.Refused -> emptyList() // e.g. http: never matched automatically
          }
        // The user-name-only page can only use a login that has a user name.
        val usable = if (request.passwordId == null) matched.filter { it.username.isNotEmpty() } else matched
        runOnUiThread {
          allLogins = logins
          matches = usable
          onVaultOpened()
        }
      } catch (e: VaultReadException) {
        runOnUiThread { showVaultProblem(e.kind) }
      } catch (e: Exception) {
        runOnUiThread { showMessage("Could not open the vault", "Something went wrong. Nothing was filled.") }
      } finally {
        // The key and the decrypted JSON are zeroed as soon as they are no longer needed.
        VaultReader.wipe(vaultKey)
        VaultReader.wipe(plain)
      }
    }
  }

  private fun loadSuffixList(): PublicSuffixList =
    assets.open("public_suffix_list.dat").bufferedReader().use { PublicSuffixList(it.lineSequence()) }

  private fun showVaultProblem(kind: VaultReadException.Kind) {
    when (kind) {
      VaultReadException.Kind.WRONG_KEY ->
        showMessage(
          "Unlock again in KiteVault",
          "KiteVault's saved fingerprint key no longer matches the vault. Open KiteVault, unlock it with your master password and turn biometric unlock on again.",
        )
      VaultReadException.Kind.UNSUPPORTED ->
        showMessage("Update KiteVault", "This vault was made by a different version of KiteVault.")
      else -> showMessage("Could not open the vault", "The vault file could not be read. Open KiteVault to check it.")
    }
  }

  // --- Step 4: choose ---------------------------------------------------------------------------

  private fun onVaultOpened() {
    val request = fill ?: return
    when {
      matches.size == 1 -> complete(matches[0])
      matches.isNotEmpty() -> showChooser(request)
      else -> showNoMatch(request)
    }
  }

  private fun showChooser(request: PendingFill) {
    ui.reset()
    ui.title("Choose a login")
    ui.body("More than one saved login fits this site. Pick the one to fill.")
    for (login in matches) ui.addRow(ui.loginRow(login.title, login.username) { complete(login) })
    secondaryButtons(request)
  }

  private fun showNoMatch(request: PendingFill) {
    ui.reset()
    val origin = request.origin
    ui.title("No saved login")
    ui.body(
      when {
        origin is OriginResult.Refused && origin.reason == Refusal.NOT_HTTPS ->
          "This page is not using a secure (https) connection, so KiteVault will not suggest a login automatically."
        canSuggest(request) ->
          "KiteVault has no login saved for this site or app. Signing up? KiteVault can make a strong password for you."
        else -> "KiteVault has no login saved for this site or app."
      }
    )
    secondaryButtons(request)
  }

  private fun secondaryButtons(request: PendingFill) {
    // A page that does not say its box is for a NEW password looks like a sign-in page, so this
    // is where a person on a sign-up page ends up. Offered only when we know exactly who is
    // asking, and not on a change-password page (where the tapped box holds the old password).
    if (canSuggest(request)) {
      ui.button("Suggest a strong password", ButtonKind.PRIMARY) {
        showStrongPassword(request) { onVaultOpened() }
      }
    }
    ui.button("Search my vault", ButtonKind.SECONDARY) { showSearch(request) }
    ui.button("Cancel", ButtonKind.TEXT) { cancel() }
  }

  /**
   * "Use strong password?": a random password for a sign-up page that the service could not tell
   * from a sign-in page. It fills the password box only. Nothing is read from the vault for it,
   * so it also works when the fingerprint did not. [back] goes to the screen it was opened from.
   */
  private fun showStrongPassword(request: PendingFill, back: () -> Unit) {
    if (suggested.isEmpty()) suggested = PasswordGenerator.generate(options)
    ui.reset()
    ui.title("Use strong password?")
    ui.body(
      "KiteVault made this password for ${request.displayName}. You won't need to remember it: " +
        "after you sign up, KiteVault will offer to save it."
    )
    val box = ui.passwordBox(suggested)
    val summary = ui.passwordSummary(suggested)
    ui.passwordOptions(options) { chosen ->
      options = chosen
      GeneratorPrefs.save(this, chosen)
      suggested = PasswordGenerator.generate(chosen)
      ui.setPassword(box, suggested)
      summary.text = AutofillStyle.passwordSummary(suggested)
    }
    ui.button("Use password", ButtonKind.PRIMARY) { useSuggested(request) }
    ui.button("Generate another", ButtonKind.SECONDARY) {
      suggested = PasswordGenerator.generate(options)
      ui.setPassword(box, suggested)
      summary.text = AutofillStyle.passwordSummary(suggested)
    }
    ui.button("Back", ButtonKind.TEXT) {
      suggested = ""
      back()
    }
  }

  private fun useSuggested(request: PendingFill) {
    val password = suggested
    if (password.isEmpty() || done) return
    // If the page is never submitted the password would exist nowhere else, so a note of it waits,
    // encrypted, for ten minutes. If the sign-up goes through, Android's own "Save?" replaces it.
    val origin = (request.origin as? OriginResult.Known)?.origin
    if (origin != null) {
      SaveCapture.forSuggestion(
        origin,
        password,
        appLabel = { AppIdentity.label(this, it) },
        appCertificates = { AppIdentity.certificates(this, it) },
      )?.let { note -> runCatching { PendingSaves.store(this).add(note) } }
    }
    fillWith(username = "", password = password)
  }

  /** Lets the user pick any login by hand. Never suggested automatically; always warned. */
  private fun showSearch(request: PendingFill) {
    ui.reset()
    ui.title("Search my vault")
    val watcher = object : TextWatcher {
      override fun afterTextChanged(s: Editable?) = refresh(s?.toString().orEmpty(), request)
      override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
      override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
    }
    ui.searchField("Search by name or user name", watcher)
    searchColumn = ui.list()
    refresh("", request)
    ui.button("Back", ButtonKind.TEXT) { onVaultOpened() }
  }

  private fun refresh(query: String, request: PendingFill) {
    val list = searchColumn ?: return
    list.removeAllViews()
    val q = query.trim().lowercase()
    val shown =
      allLogins
        .filter { q.isEmpty() || it.title.lowercase().contains(q) || it.username.lowercase().contains(q) }
        .sortedBy { it.title.lowercase() }
        .take(50)
    for (login in shown) {
      val row = ui.loginRow(login.title, login.username) { confirmManual(request, login) }
      list.addView(row, LinearLayout.LayoutParams(MATCH, WRAP).apply { bottomMargin = ui.dp(10) })
    }
    if (shown.isEmpty()) list.addView(ui.emptyLine("No logins found."))
  }

  /** A login that does NOT match this site or app: explain, and ask for a second tap. */
  private fun confirmManual(request: PendingFill, login: LoginRecord) {
    searchColumn = null
    ui.reset()
    ui.message(
      R.drawable.kitevault_ic_warning,
      AutofillStyle.CORAL,
      "This login is not saved for ${request.displayName}",
      "You picked \"${login.title}\", which is saved for:\n${
        login.urls.joinToString("\n").ifEmpty { "(no website)" }
      }\n\nYou are on:\n${request.displayName}\n\nIf these are not the same, a fake site or app may be trying to steal this password."
    )
    ui.button("Cancel", ButtonKind.PRIMARY) { cancel() }
    ui.button("Fill anyway", ButtonKind.DANGER) { complete(login) }
  }

  // --- Step 5: hand the login to Android --------------------------------------------------------

  private fun complete(login: LoginRecord) = fillWith(login.username, login.password)

  private fun fillWith(username: String, password: String) {
    val request = fill ?: return
    if (done) return
    // The user-name-only page has nothing else to fill, so a login without a user name is no help.
    if (request.passwordId == null && username.isEmpty()) {
      showMessage("No user name", "This login has no user name to fill. Pick another one, or type it in yourself.")
      return
    }
    done = true
    // Only the boxes we found are given a value (the user name only when there is one). What is
    // handed back is a dataset, because the suggestion that was tapped was a locked dataset:
    // Android fills a dataset that comes back from the unlock screen into the boxes right away.
    // (The question "Save to KiteVault?" belongs to the first answer and is not repeated here.)
    @Suppress("DEPRECATION")
    val dataset = Dataset.Builder()
    request.passwordId?.let { dataset.setValue(it, AutofillValue.forText(password)) }
    request.usernameId?.let {
      if (username.isNotEmpty()) dataset.setValue(it, AutofillValue.forText(username))
    }
    setResult(Activity.RESULT_OK, Intent().putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, dataset.build()))
    clear()
    finish()
  }

  private fun cancel() {
    done = true
    setResult(Activity.RESULT_CANCELED)
    clear()
    finish()
  }

  /** Drops every reference to the logins so they can be freed. */
  private fun clear() {
    matches = emptyList()
    allLogins = emptyList()
    suggested = ""
    searchColumn = null
  }

  // Leaving the screen (home button, another app) ends the request.
  override fun onStop() {
    super.onStop()
    if (!done && !waitingForBiometric && !isChangingConfigurations) cancel()
  }

  override fun onDestroy() {
    clear()
    worker.shutdownNow()
    super.onDestroy()
  }

  // --- The frame ----------------------------------------------------------------------------------

  private fun buildShell(request: PendingFill) {
    // Tapping the dimmed area above the sheet closes it without filling anything.
    ui.install { cancel() }
    // Ignore taps while another window (an overlay) covers this one: stops tap-jacking.
    ui.root.filterTouchesWhenObscured = true
    ui.sheet.filterTouchesWhenObscured = true

    // The pill says who is asking. A web address a trusted browser reported over https is shown
    // with a green lock; an app's name is only a label, so it gets an amber one.
    val origin = request.origin
    val verified = origin is OriginResult.Known && origin.origin is Origin.Web
    ui.showContext(request.displayName, verified)

    ui.reset()
    ui.loading("Unlocking KiteVault…")
  }

  private fun showMessage(heading: String, text: String) {
    ui.reset()
    ui.message(R.drawable.kitevault_ic_warning, AutofillStyle.AMBER, heading, text)
    ui.button("Close", ButtonKind.PRIMARY) { cancel() }
  }

  companion object {
    const val EXTRA_TICKET = "expo.modules.kitevaultkeystore.autofill.TICKET"
    private const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
    private const val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT
  }
}
