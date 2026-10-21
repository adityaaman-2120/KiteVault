# Decisions

Record important decisions here, newest last. Keep each entry short.

## Template

### YYYY-MM-DD: Title

- **Decision:** what we chose
- **Why:** the reason
- **Alternatives considered:** what we rejected

---

### 2026-10-21: Project ground rules

- **Decision:** Security and workflow rules live in `CLAUDE.md` at the repo root. Stack: Expo dev builds (not Expo Go), TypeScript strict, Expo Router, Zustand, EAS Build. Vault uses AES-256-GCM with Argon2id key derivation.
- **Why:** Offline-first password manager; no custom crypto, no network beyond optional Drive backup and breach check.
- **Alternatives considered:** None recorded.

---

### 2026-10-21: Crypto library — react-native-quick-crypto for both Argon2id and AES-256-GCM

- **Decision:** Use `react-native-quick-crypto` 1.1.8 (Margelo, MIT) for everything: random bytes, Argon2id, and AES-256-GCM. Its native dependencies `react-native-nitro-modules` 0.37.1 and `react-native-quick-base64` 3.0.1 are installed alongside it. All three are pinned to exact versions. It is imported in exactly one file, `src/crypto/engine.ts`.
- **Why:**
  - Actively maintained: the latest release was 2026-10-08, and the package is used widely in React Native crypto work.
  - It wraps OpenSSL, a heavily audited implementation, through JSI/Nitro. We write no cipher or KDF code ourselves.
  - It provides a Node-compatible `createCipheriv('aes-256-gcm')` with an auth tag and an RFC 9106 `argon2('argon2id', ...)` that runs off the JS thread.
  - Peer requirements (`expo >= 48`, `react-native`, Nitro) are satisfied by Expo SDK 58 / RN 0.88. It needs a native build, which we already require (development builds, never Expo Go).
  - One library means one native dependency to audit and update.
- **Alternatives considered:**
  - `react-native-libsodium` (1.7.0, last release Feb 2026): has Argon2id, but libsodium's AES-256-GCM is only available on CPUs with AES hardware acceleration. Its portable AEAD is XChaCha20-Poly1305, which is not the cipher chosen in CLAUDE.md. Using it would also mean two crypto libraries.
  - Pure-JS libraries (for example `@noble/*`): well regarded, but slow for Argon2 on Hermes, which would force weaker parameters.
- **Not yet verified:** The native module has not run on a device. Unit tests run in Jest, where `react-native-quick-crypto` is replaced by Node's built-in OpenSSL `crypto` (`jest/quick-crypto-node.js`). That checks our logic and the algorithm vectors, not the native binding. **Before relying on this, build the development build and run a device self-test (encrypt/decrypt round trip, and the RFC 9106 Argon2id vector).**

### 2026-10-21: Crypto layer design (src/crypto)

- **Key derivation:** Argon2id v1.3, 32-byte output, 16-byte (minimum) salt. Default parameters are 64 MiB memory, 3 passes, 1 lane. They are above the OWASP minimum and meant to take around a second on a mid-range phone. **This has not been measured on a real device and should be tuned on one.**
- **Parameters live in the vault header** (`KdfParams`: algorithm, version, memoryKiB, iterations, parallelism) so cost can be raised later and old vaults still open. Because the header is read from storage, `deriveKeyFromPassword` refuses unsafe values: memory below 19 MiB or above 1 GiB, fewer than 2 passes, more than 20 passes, parallelism outside 1–8.
- **Password handling:** string passwords are normalized to Unicode NFKC before hashing, so the same password typed on different keyboards gives the same key. Changing this later would lock users out, so treat it as part of the vault format.
- **Encryption:** AES-256-GCM, fresh random 12-byte IV from the library's CSPRNG on every call, 16-byte tag. Blob layout is `iv (12) | ciphertext | tag (16)`. There is no way for a caller to supply an IV. Random 96-bit IVs are safe up to about 2^32 encryptions per key; a vault key will see far fewer.
- **Decryption errors:** a wrong key and modified data both raise the same `CryptoError('DECRYPT_FAILED')` with a message that contains no secret data, so callers cannot tell them apart.
- **Key wrapping:** `wrapKey`/`unwrapKey` encrypt a 32-byte key with the same AES-256-GCM routine (so a wrapped key is `iv | key | tag`, 60 bytes). We use this instead of RFC 3394 AES-KW because it uses the one primitive we already depend on, and GCM gives the same integrity guarantee. The intended use is a random vault key wrapped by the password-derived key, so the password can change without re-encrypting the vault.
- **Randomness:** `generateRandomBytes` uses `randomBytes` from the library. `Math.random()` is not used anywhere.

### 2026-10-21: Limits of wiping secrets from memory in JavaScript

`wipe()` zeroes the `Uint8Array` it is given, and the crypto layer wipes the temporary buffers it creates (the encoded password and intermediate plaintext). This is best effort, and it is **not a guarantee** that secrets are gone from memory:

- **Strings cannot be wiped.** JavaScript strings are immutable. A master password typed into a text field exists as a string (and in the native text input) until the garbage collector reclaims it, and we cannot force or time that. Treat the master password as living in memory for some time after use.
- **Copies we do not control.** The JS engine may copy or move buffers (garbage collection, typed-array growth). Zeroing one copy leaves any others intact.
- **Native memory.** The OpenSSL context and Argon2 working memory are managed by the native library. We rely on it to clear them; we cannot verify that from JavaScript.
- **Outside the app.** Memory can be paged to swap or captured by a debugger on a rooted device, or by a memory dump, regardless of what we zero.
- **What this still buys:** keeping keys and decrypted data in `Uint8Array`s that we zero when the vault locks (CLAUDE.md rule 4) shortens how long they sit in memory and removes the easiest copies. Keys should therefore always be held as `Uint8Array`, never converted to strings (hex, base64) and never put in Zustand state or logs.
- **Mitigations to consider later:** auto-lock timers, locking when the app is backgrounded, and `FLAG_SECURE` for screens that show secrets.
