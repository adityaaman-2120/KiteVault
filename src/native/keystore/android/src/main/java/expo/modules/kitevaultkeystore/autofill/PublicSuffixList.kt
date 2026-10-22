package expo.modules.kitevaultkeystore.autofill

import java.net.IDN

/**
 * Knows which endings of a web address are "shared by many unrelated owners", like `.com`,
 * `.co.uk` or `github.io`.
 *
 * In simple words: `bank.com` belongs to one owner, but `someone.github.io` and `other.github.io`
 * belong to different people. When we decide whether a saved login for `example.com` may be used
 * on `login.example.com`, we must know that `example.com` is a name somebody registered, not a
 * shared ending. This class answers that, using the public "Public Suffix List" (the same list
 * browsers use). The list file is bundled in the app, so no internet is needed.
 */
internal class PublicSuffixList(rules: Sequence<String>) {
  private val normal = HashSet<String>()
  private val wildcardBases = HashSet<String>() // "*.ck" is stored as "ck"
  private val exceptions = HashSet<String>() // "!www.ck" is stored as "www.ck"

  init {
    for (raw in rules) {
      val line = raw.trim()
      // Comments start with "//". A rule is the first word on its line.
      if (line.isEmpty() || line.startsWith("//")) continue
      val rule = line.split(Regex("\\s+"))[0]
      when {
        rule.startsWith("!") -> toAscii(rule.substring(1))?.let { exceptions.add(it) }
        rule.startsWith("*.") -> toAscii(rule.substring(2))?.let { wildcardBases.add(it) }
        else -> toAscii(rule)?.let { normal.add(it) }
      }
    }
  }

  /**
   * How many labels at the end of [host] form its public suffix. For `a.b.co.uk` that is 2
   * ("co.uk"); for `example.com` it is 1.
   */
  private fun suffixLabelCount(labels: List<String>): Int {
    var best = 1 // The default rule: an unknown ending is a one-label suffix.
    for (k in 1..labels.size) {
      val suffix = labels.takeLast(k).joinToString(".")
      // An exception rule beats every other rule: the suffix is one label shorter.
      if (suffix in exceptions) return k - 1
      if (suffix in normal) best = maxOf(best, k)
      if (k >= 2 && labels.takeLast(k - 1).joinToString(".") in wildcardBases) best = maxOf(best, k)
    }
    return best
  }

  /** True if [host] is itself a shared ending (for example `com`, `co.uk`, `github.io`). */
  fun isPublicSuffix(host: String): Boolean {
    val labels = host.split(".")
    return labels.size <= suffixLabelCount(labels)
  }

  /**
   * The part of [host] somebody can actually register (`login.example.co.uk` gives
   * `example.co.uk`), or null if [host] is only a public suffix.
   */
  fun registrableDomain(host: String): String? {
    val labels = host.split(".")
    val suffixCount = suffixLabelCount(labels)
    if (labels.size <= suffixCount) return null
    return labels.takeLast(suffixCount + 1).joinToString(".")
  }

  private fun toAscii(name: String): String? =
    try {
      IDN.toASCII(name, IDN.ALLOW_UNASSIGNED).lowercase()
    } catch (e: IllegalArgumentException) {
      null
    }

  companion object {
    /** Reads the bundled list (`assets/public_suffix_list.dat`). */
    fun fromLines(lines: Sequence<String>) = PublicSuffixList(lines)
  }
}
