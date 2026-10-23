package expo.modules.kitevaultkeystore.autofill

import android.app.assist.AssistStructure
import android.os.Build
import android.view.View
import android.view.autofill.AutofillId

/**
 * A [ParsedScreen] plus the Android `AutofillId` of each of its fields (same order).
 * [values] holds what is typed in each box, but ONLY when the parser was asked for it (when the
 * user submits a form to be saved). When filling, it is empty and no typed text is ever read.
 */
internal class ParsedRequest(
  val screen: ParsedScreen,
  val ids: List<AutofillId>,
  val values: List<String?> = emptyList(),
)

/**
 * Reads the screen description Android gives us and turns it into a [ParsedScreen].
 *
 * In simple words: Android hands the autofill service a tree of everything on the other app's
 * screen. This class walks through that tree and writes down, for every text box, the few facts
 * we need. It remembers whether a box is truly visible (a box inside something hidden does not
 * count). It stops after a fixed number of boxes so a hostile app cannot make us work forever.
 * It reads the text people typed only when asked to (when a form is submitted to be saved),
 * and never keeps or logs it.
 */
internal object StructureParser {
  private const val MAX_NODES = 4000
  private const val MAX_DEPTH = 60
  private const val MAX_LABEL = 200

  /** The words a box carries about itself, in lower case, cut to a sensible length. */
  private fun labelOf(node: AssistStructure.ViewNode, attributes: Map<String, String>): String =
    listOfNotNull(
        node.hint,
        node.idEntry,
        node.contentDescription?.toString(),
        attributes["name"],
        attributes["id"],
        attributes["placeholder"],
        attributes["aria-label"],
      )
      .joinToString(" ")
      .lowercase()
      .take(MAX_LABEL)

  fun parse(structure: AssistStructure, withValues: Boolean = false): ParsedRequest {
    val fields = ArrayList<FieldNode>()
    val ids = ArrayList<AutofillId>()
    val values = ArrayList<String?>()
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
            label = labelOf(node, attributes),
          )
        )
        ids.add(id)
        if (withValues) {
          values.add(node.autofillValue?.takeIf { it.isText }?.textValue?.toString())
        }
      }
      for (i in 0 until node.childCount) walk(node.getChildAt(i), shown, depth + 1)
    }

    for (i in 0 until structure.windowNodeCount) {
      walk(structure.getWindowNodeAt(i).rootViewNode, parentShown = true, depth = 0)
    }
    val packageName = structure.activityComponent?.packageName.orEmpty()
    return ParsedRequest(ParsedScreen(packageName, fields), ids, values)
  }
}
