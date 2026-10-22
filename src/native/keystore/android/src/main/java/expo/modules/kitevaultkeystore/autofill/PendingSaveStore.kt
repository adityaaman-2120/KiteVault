package expo.modules.kitevaultkeystore.autofill

import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption

/** Encrypts and decrypts the pending-save file. The real one uses a key in the Android Keystore. */
internal interface Sealer {
  fun seal(plain: ByteArray): ByteArray

  /** Returns null if [sealed] was changed or was made with another key. */
  fun open(sealed: ByteArray): ByteArray?
}

/**
 * The small encrypted file where logins wait to be saved.
 *
 * In simple words: the service has no key to the vault (and must never write the vault), so a
 * login that the user agreed to save is parked here, scrambled with a key that only this app can
 * use. The file holds at most 3 logins, each for at most 10 minutes. The app asks for them after
 * the user unlocks it, saves them into the vault, and then tells this store to delete them. If the
 * file is ever damaged or cannot be read, it is simply deleted: a lost pending save costs the
 * user one extra sign-in, a half-readable one could cost more.
 *
 * File layout: one version byte (1), then the sealed JSON from [PendingSaveCodec]. Writes go to a
 * temporary file that is renamed over the real one, so a crash never leaves a half-written file.
 */
internal class PendingSaveStore(
  private val file: File,
  private val sealer: Sealer,
  private val clock: () -> Long = System::currentTimeMillis,
  private val newId: () -> String,
) {
  private val temp = File(file.parentFile, file.name + ".tmp")

  /** Parks a login. A newer save for the same account and place replaces the older one. */
  @Synchronized
  fun add(save: NewSave): PendingSave {
    val kept = load().filterNot { PendingSaveCodec.sameTarget(it.save, save) }.toMutableList()
    val record = PendingSave(newId(), clock(), save)
    kept.add(record)
    while (kept.size > PendingSaveCodec.MAX_RECORDS) kept.removeAt(0)
    write(kept)
    return record
  }

  /** The waiting logins, oldest first. Expired ones are deleted first. */
  @Synchronized fun list(): List<PendingSave> = load()

  @Synchronized
  fun remove(id: String): Boolean {
    val current = load()
    val left = current.filter { it.id != id }
    if (left.size == current.size) return false
    write(left)
    return true
  }

  /** Deletes everything (for example when the vault is erased). */
  @Synchronized
  fun clear() {
    file.delete()
    temp.delete()
  }

  // Reads the file, drops expired records (and rewrites the file if any were dropped).
  private fun load(): List<PendingSave> {
    if (!file.isFile) return emptyList()
    val all =
      try {
        val bytes = file.readBytes()
        val plain = if (bytes.isNotEmpty() && bytes[0] == VERSION) sealer.open(bytes.copyOfRange(1, bytes.size)) else null
        if (plain == null) null else PendingSaveCodec.decode(plain).also { VaultReader.wipe(plain) }
      } catch (e: Exception) {
        null
      }
    if (all == null) {
      clear() // unreadable: throw it away rather than keep something we cannot trust
      return emptyList()
    }
    val now = clock()
    val fresh = all.filter { now - it.createdAt in 0..PendingSaveCodec.MAX_AGE_MS }.takeLast(PendingSaveCodec.MAX_RECORDS)
    if (fresh.size != all.size) write(fresh)
    return fresh
  }

  private fun write(list: List<PendingSave>) {
    if (list.isEmpty()) {
      clear()
      return
    }
    val plain = PendingSaveCodec.encode(list)
    try {
      val sealed = sealer.seal(plain)
      temp.writeBytes(byteArrayOf(VERSION) + sealed)
      Files.move(temp.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
    } finally {
      VaultReader.wipe(plain)
      temp.delete() // only exists if the move did not happen; it holds only encrypted bytes
    }
  }

  private companion object {
    const val VERSION: Byte = 1
  }
}
