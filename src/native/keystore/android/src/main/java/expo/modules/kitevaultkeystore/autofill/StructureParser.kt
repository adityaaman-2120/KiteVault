package expo.modules.kitevaultkeystore.autofill

import android.app.assist.AssistStructure
import android.os.Build
import android.view.View
import android.view.autofill.AutofillId

/** A [ParsedScreen] plus the Android `AutofillId` of each of its fields (same order). */
internal class ParsedRequest(val screen: ParsedScreen, val ids: List<AutofillId>)

/**
 * Reads the screen description Android gives us and turns it into a [ParsedScreen].
 *
 * In simple words: Android hands the autofill service a tree of everything on the other app's
 * screen. This class walks through that tree and writes down, for every text box, the few facts
 * we need. It remembers whether a box is truly visible (a box inside something hidden does not
 * count). It stops after a fixed number of boxes so a hostile app cannot make us work forever.
 * It does not look at, keep or log the text people typed.
 */
internal object StructureParser {
  private const val MAX_NODES = 4000
  private const val MAX_DEPTH = 60

  fun parse(structure: AssistStructure): ParsedRequest {
    val fields = ArrayList<FieldNode>()
    val ids = ArrayList<AutofillId>()
    var visited = 0

    fun walk(node: AssistStructure.ViewNode, parentShown: Boolean, depth: Int) {
      if (visited++ >= MAX_NODES || depth > MAX_DEPTH) return
      val shown = parentShown && node.visibility == View.VISIBLE
      val id = node.autofillId
      if (id != null && node.autofillType == View.AUTOFILL_TYPE_TEXT) {
        val html = node.htmlInfo
        val attributes = html?.attributes?.associate { it.first.lowercase() to it.second } ?: emptyMap()
        fields.add(
          FieldNode(
            index = fields.size,
            autofillHints = node.autofillHints?.toList() ?: emptyList(),
            htmlType = attributes["type"],
            htmlAutocomplete = attributes["autocomplete"],
            inputType = node.inputType,
            isFocused = node.isFocused,
            isUsable = shown && node.isEnabled && node.width > 0 && node.height > 0,
            webDomain = node.webDomain,
            // The scheme is only reported by Android 9 and newer; older versions give null,
            // which RequestOrigin treats as "not https".
            webScheme = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) node.webScheme else null,
          )
        )
        ids.add(id)
      }
      for (i in 0 until node.childCount) walk(node.getChildAt(i), shown, depth + 1)
    }

    for (i in 0 until structure.windowNodeCount) {
      walk(structure.getWindowNodeAt(i).rootViewNode, parentShown = true, depth = 0)
    }
    val packageName = structure.activityComponent?.packageName.orEmpty()
    return ParsedRequest(ParsedScreen(packageName, fields), ids)
  }
}
