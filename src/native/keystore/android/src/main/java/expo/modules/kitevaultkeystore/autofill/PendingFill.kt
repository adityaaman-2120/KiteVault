package expo.modules.kitevaultkeystore.autofill

import android.service.autofill.SaveInfo
import android.view.autofill.AutofillId

/**
 * Everything the service worked out about one fill request, handed to the unlock screen.
 *
 * In simple words: the service looked at the other app's screen. This class is its note to the
 * unlock screen: who is asking (already checked), what to call them on screen, and which boxes to
 * fill. It contains NO vault data. The unlock screen gets it back only by presenting a one-time
 * ticket (see [RequestRegistry]).
 */
internal class PendingFill(
  /** Who is asking, or why we refused to know. */
  val origin: OriginResult,
  /** The package of the app (or browser) that owns the screen. */
  val packageName: String,
  /** Text to show the user: the web host, or the app's name. Only the web host is verified. */
  val displayName: String,
  /** The password box to fill; null on the user-name-only first page of a two-page sign-in. */
  val passwordId: AutofillId?,
  val usernameId: AutofillId?,
  /** Asks Android to offer to save the form afterwards; null when the origin is not trusted. */
  val saveInfo: SaveInfo? = null,
  /**
   * Whether KiteVault may offer a strong password on this screen. True on a page that has only
   * sign-in boxes (an unmarked sign-up page looks exactly like that). False on the user-name-only
   * page, and on a change-password page, where the box that was tapped holds the OLD password.
   */
  val allowSuggest: Boolean = false,
)

/** The process-wide notebook of fill requests that are waiting for the user. */
internal object FillRequests {
  val registry = RequestRegistry<PendingFill>()
}
