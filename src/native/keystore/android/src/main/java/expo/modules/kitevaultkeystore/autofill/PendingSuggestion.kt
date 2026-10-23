package expo.modules.kitevaultkeystore.autofill

import android.view.autofill.AutofillId

/**
 * What the service worked out about a sign-up page, handed to the "Use strong password?" screen.
 *
 * In simple words: the service saw a form with a NEW password box. This is its note to the
 * suggestion screen: who is asking (already checked with the same strict rules as filling), what
 * to call them on screen, and which boxes to fill (the new password and its "confirm" box). It
 * holds no vault data and no password: the password is made later, on the suggestion screen. The
 * screen gets the note back only with a one-time ticket (see [RequestRegistry]).
 */
internal class PendingSuggestion(
  /** Who is asking. Only a trusted-browser web address or an app's package name ever gets here. */
  val origin: Origin,
  /** The package of the app (or browser) that owns the screen. */
  val packageName: String,
  /** Text to show the user: the web host, or the app's name. Only the web host is verified. */
  val displayName: String,
  /** Every visible new-password box on the form, so "confirm password" gets the same value. */
  val passwordIds: List<AutofillId>,
)

/** The process-wide notebook of suggestion requests that are waiting for the user. */
internal object SuggestionRequests {
  val registry = RequestRegistry<PendingSuggestion>()
}
