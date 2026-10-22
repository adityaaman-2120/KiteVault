package expo.modules.kitevaultkeystore.autofill

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.service.autofill.Dataset
import android.service.autofill.FillResponse
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.view.autofill.AutofillManager
import android.view.autofill.AutofillValue
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.RemoteViews
import android.widget.ScrollView
import android.widget.TextView
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
 *     (and only those two). Then it closes.
 *
 * It cannot be started by other apps (it is not exported), hides itself from screenshots and the
 * recent-apps list, ignores taps while another window covers it, and closes if the user leaves it.
 */
class AutofillAuthActivity : FragmentActivity() {
  private var fill: PendingFill? = null
  private var matches: List<LoginRecord> = emptyList()
  private var allLogins: List<LoginRecord> = emptyList()

  private val worker = Executors.newSingleThreadExecutor()
  private var waitingForBiometric = false
  private var done = false

  private lateinit var card: LinearLayout

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
    buildShell()

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

  // --- Step 2: the fingerprint / face check ---------------------------------------------------

  private fun startUnlock() {
    val request = fill ?: return
    val who =
      if (request.origin is OriginResult.Known && request.origin.origin is Origin.App) {
        "${request.displayName} (${request.packageName})"
      } else request.displayName
    waitingForBiometric = true
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
    when (code) {
      ErrorCode.USER_CANCELED -> cancel()
      ErrorCode.REAUTH_REQUIRED ->
        showMessage(
          "Unlock KiteVault first",
          "For your safety, KiteVault needs your master password again. Open KiteVault, unlock it with your master password, then try again.",
        )
      ErrorCode.NOT_ENABLED ->
        showMessage(
          "Turn on biometric unlock",
          "Autofill needs fingerprint or face unlock. Open KiteVault, go to Settings and turn on biometric unlock.",
        )
      ErrorCode.KEY_INVALIDATED ->
        showMessage(
          "Unlock again in KiteVault",
          "Your fingerprints or face data changed, so KiteVault turned biometric unlock off. Open KiteVault and turn it on again.",
        )
      else -> showMessage("Could not unlock", "KiteVault could not use your fingerprint or face. Try again.")
    }
  }

  // --- Step 3: read the vault and find matches ------------------------------------------------

  private fun openVault(vaultKey: ByteArray) {
    val request = fill ?: return
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
        runOnUiThread {
          allLogins = logins
          matches = matched
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
    reset()
    title("Choose a login for ${request.displayName}")
    for (login in matches) row(login) { complete(login) }
    secondaryButtons(request)
  }

  private fun showNoMatch(request: PendingFill) {
    reset()
    val origin = request.origin
    title("No saved login for ${request.displayName}")
    body(
      when {
        origin is OriginResult.Refused && origin.reason == Refusal.NOT_HTTPS ->
          "This page is not using a secure (https) connection, so KiteVault will not suggest a login automatically."
        else -> "KiteVault has no login saved for this site or app."
      }
    )
    secondaryButtons(request)
  }

  private fun secondaryButtons(request: PendingFill) {
    button("Search my vault", primary = false) { showSearch(request) }
    button("Cancel", primary = false) { cancel() }
  }

  /** Lets the user pick any login by hand. Never suggested automatically; always warned. */
  private fun showSearch(request: PendingFill) {
    reset()
    title("Search my vault")
    val input = EditText(this).apply {
      hint = "Search by name or user name"
      setSingleLine()
      setTextColor(Color.BLACK)
      setHintTextColor(Color.GRAY)
    }
    card.addView(input)
    val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    card.addView(ScrollView(this).apply { addView(list) }, LinearLayout.LayoutParams(MATCH, dp(260)))

    fun refresh(query: String) {
      list.removeAllViews()
      val q = query.trim().lowercase()
      val shown =
        allLogins
          .filter { q.isEmpty() || it.title.lowercase().contains(q) || it.username.lowercase().contains(q) }
          .sortedBy { it.title.lowercase() }
          .take(50)
      for (login in shown) {
        list.addView(rowView(login) { confirmManual(request, login) })
      }
      if (shown.isEmpty()) list.addView(TextView(this).apply { text = "No logins found."; setTextColor(Color.DKGRAY) })
    }
    input.addTextChangedListener(object : TextWatcher {
      override fun afterTextChanged(s: Editable?) = refresh(s?.toString().orEmpty())
      override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
      override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
    })
    refresh("")
    button("Back", primary = false) { onVaultOpened() }
  }

  /** A login that does NOT match this site or app: explain, and ask for a second tap. */
  private fun confirmManual(request: PendingFill, login: LoginRecord) {
    reset()
    title("This login is not saved for ${request.displayName}")
    body(
      "You picked \"${login.title}\", which is saved for:\n${
        login.urls.joinToString("\n").ifEmpty { "(no website)" }
      }\n\nYou are on:\n${request.displayName}\n\nIf these are not the same, a fake site or app may be trying to steal this password."
    )
    button("Fill anyway", primary = false) { complete(login) }
    button("Cancel", primary = true) { cancel() }
  }

  // --- Step 5: hand the login to Android --------------------------------------------------------

  private fun complete(login: LoginRecord) {
    val request = fill ?: return
    if (done) return
    done = true
    // Only the two boxes we found are given a value. The presentation is required by the API but
    // never shown, because the answer is filled in straight away.
    @Suppress("DEPRECATION")
    val dataset = Dataset.Builder(RemoteViews(packageName, R.layout.kitevault_autofill_locked_item))
    dataset.setValue(request.passwordId, AutofillValue.forText(login.password))
    request.usernameId?.let {
      if (login.username.isNotEmpty()) dataset.setValue(it, AutofillValue.forText(login.username))
    }
    val response = FillResponse.Builder().addDataset(dataset.build()).build()
    setResult(Activity.RESULT_OK, Intent().putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, response))
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

  // --- A tiny screen built in code (no layout files, nothing to inflate or leak) ---------------

  private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

  private fun buildShell() {
    val root = FrameLayout(this)
    // Ignore taps while another window (an overlay) covers this one: stops tap-jacking.
    root.filterTouchesWhenObscured = true
    card = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(20), dp(20), dp(20), dp(20))
      background = GradientDrawable().apply {
        setColor(Color.WHITE)
        cornerRadii = floatArrayOf(dp(20).toFloat(), dp(20).toFloat(), dp(20).toFloat(), dp(20).toFloat(), 0f, 0f, 0f, 0f)
      }
      filterTouchesWhenObscured = true
    }
    root.addView(card, FrameLayout.LayoutParams(MATCH, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))
    setContentView(root)
    title("KiteVault")
    body("Unlocking…")
  }

  private fun reset() {
    card.removeAllViews()
  }

  private fun showMessage(heading: String, text: String) {
    reset()
    title(heading)
    body(text)
    button("Close", primary = true) { cancel() }
  }

  private fun title(text: String) {
    card.addView(TextView(this).apply {
      this.text = text
      textSize = 18f
      setTextColor(Color.BLACK)
      setPadding(0, 0, 0, dp(8))
    })
  }

  private fun body(text: String) {
    card.addView(TextView(this).apply {
      this.text = text
      textSize = 15f
      setTextColor(Color.DKGRAY)
      setPadding(0, 0, 0, dp(12))
    })
  }

  private fun button(text: String, primary: Boolean, onClick: () -> Unit) {
    card.addView(Button(this).apply {
      this.text = text
      isAllCaps = false
      if (primary) {
        setBackgroundColor(Color.parseColor("#2F6F8F"))
        setTextColor(Color.WHITE)
      }
      setOnClickListener { onClick() }
    })
  }

  private fun rowView(login: LoginRecord, onClick: () -> Unit): View =
    Button(this).apply {
      text = if (login.username.isEmpty()) login.title else "${login.title}\n${login.username}"
      isAllCaps = false
      gravity = Gravity.START or Gravity.CENTER_VERTICAL
      setOnClickListener { onClick() }
    }

  private fun row(login: LoginRecord, onClick: () -> Unit) = card.addView(rowView(login, onClick))

  companion object {
    const val EXTRA_TICKET = "expo.modules.kitevaultkeystore.autofill.TICKET"
    private const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
  }
}
