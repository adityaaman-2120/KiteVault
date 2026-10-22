package expo.modules.kitevaultkeystore.autofill

import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/** Where a login that is waiting to be saved was typed. */
internal enum class SaveKind { WEB, APP }

/** What the service captured; the store adds an id and a time. */
internal class NewSave(
  val kind: SaveKind,
  val username: String,
  val password: String,
  /** For a web page: the host, already normalized. */
  val host: String?,
  /** For an app: package name, display name (shown to the user, never trusted) and certificate. */
  val packageName: String?,
  val label: String?,
  val certSha256: String?,
)

/**
 * A login that was typed in another app or website and is waiting for the user to confirm saving
 * it inside KiteVault.
 *
 * In simple words: when the user signs up or logs in somewhere and agrees to "Save to KiteVault?",
 * Android tells our service the user name and password. The service must NOT write them into the
 * vault itself (the app is the only writer), so it keeps this note in a small encrypted file until
 * the user opens KiteVault, unlocks it and confirms.
 *
 * [toString] hides everything on purpose so a secret can never end up in a log by accident.
 */
internal class PendingSave(
  val id: String,
  val createdAt: Long,
  val save: NewSave,
) {
  override fun toString() = "PendingSave(${save.kind})"
}

/**
 * Turns pending saves into bytes and back (JSON), with the size and age limits.
 * Pure Kotlin, so every rule is unit tested without a phone.
 */
internal object PendingSaveCodec {
  /** A pending save is thrown away after ten minutes. */
  const val MAX_AGE_MS = 10 * 60 * 1000L

  /** At most this many are kept; the oldest is dropped first. */
  const val MAX_RECORDS = 3

  private const val MAX_TEXT = 4096

  fun encode(list: List<PendingSave>): ByteArray {
    val array = JSONArray()
    for (p in list) {
      val s = p.save
      array.put(
        JSONObject()
          .put("id", p.id)
          .put("createdAt", p.createdAt)
          .put("kind", s.kind.name)
          .put("username", s.username)
          .put("password", s.password)
          .put("host", s.host ?: JSONObject.NULL)
          .put("packageName", s.packageName ?: JSONObject.NULL)
          .put("label", s.label ?: JSONObject.NULL)
          .put("certSha256", s.certSha256 ?: JSONObject.NULL)
      )
    }
    return array.toString().toByteArray(Charsets.UTF_8)
  }

  /** Returns null if the bytes are not what we wrote. Records with a bad shape are skipped. */
  fun decode(bytes: ByteArray): List<PendingSave>? {
    val array =
      try {
        JSONArray(String(bytes, Charsets.UTF_8))
      } catch (e: JSONException) {
        return null
      }
    val out = ArrayList<PendingSave>()
    for (i in 0 until array.length()) {
      val o = array.optJSONObject(i) ?: continue
      val kind = SaveKind.values().firstOrNull { it.name == o.optString("kind") } ?: continue
      val id = o.optString("id")
      if (id.isEmpty() || id.length > 64) continue
      val password = o.optString("password")
      if (password.isEmpty() || password.length > MAX_TEXT) continue
      val username = o.optString("username")
      if (username.length > MAX_TEXT) continue
      fun text(key: String): String? =
        if (o.isNull(key)) null else o.optString(key).takeIf { it.isNotEmpty() && it.length <= MAX_TEXT }
      val save = NewSave(kind, username, password, text("host"), text("packageName"), text("label"), text("certSha256"))
      // A web save needs a host; an app save needs a package and its certificate.
      val complete =
        if (kind == SaveKind.WEB) save.host != null else save.packageName != null && save.certSha256 != null
      if (!complete) continue
      out.add(PendingSave(id, o.optLong("createdAt"), save))
    }
    return out
  }

  /** Same place and same account: a newer save replaces the older one. */
  fun sameTarget(a: NewSave, b: NewSave): Boolean =
    a.kind == b.kind &&
      a.username == b.username &&
      a.host == b.host &&
      a.packageName == b.packageName &&
      a.certSha256 == b.certSha256
}
