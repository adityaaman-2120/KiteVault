package expo.modules.kitevaultkeystore

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.PersistableBundle
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Copies a secret to the clipboard and tells Android it is a secret.
 *
 * In simple words: when you copy a password, Android 13 and newer normally shows a little preview
 * of what you copied (a bubble above the keyboard). Marking the copy as "sensitive" makes Android
 * hide the text in that preview. The copy works exactly as before; only the preview is hidden.
 * Older Android versions ignore the mark, which is harmless.
 */
class ClipboardModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("KitevaultClipboard")

    // Returns true if the text was put on the clipboard.
    Function("setSensitiveText") { text: String ->
      val manager = context.getSystemService(ClipboardManager::class.java)
      if (manager == null) {
        false
      } else {
        // An empty label, so no description of the content is stored next to it.
        val clip = ClipData.newPlainText("", text)
        clip.description.extras = PersistableBundle().apply { putBoolean(EXTRA_IS_SENSITIVE, true) }
        manager.setPrimaryClip(clip)
        true
      }
    }
  }

  private companion object {
    // ClipDescription.EXTRA_IS_SENSITIVE (Android 13+), written out so older SDKs compile too.
    const val EXTRA_IS_SENSITIVE = "android.content.extra.IS_SENSITIVE"
  }
}
