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
  val passwordId: AutofillId,
  val usernameId: AutofillId?,
  /** Asks Android to offer to save the form afterwards; null when the origin is not trusted. */
  val saveInfo: SaveInfo? = null,
)

/** The process-wide notebook of fill requests that are waiting for the user. */
internal object FillRequests {
  val registry = RequestRegistry<PendingFill>()
}
