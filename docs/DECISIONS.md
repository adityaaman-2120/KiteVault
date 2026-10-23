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

---

### 2026-10-21: Vault file format (version 1) and key design

**Keys**

- A random 256-bit **vault key** encrypts the vault body. It is never derived from the password.
- The master password goes through Argon2id (parameters in the header) to give a **password key**. The password key only wraps the vault key (AES-256-GCM, see the crypto decision above). Neither key is stored unwrapped.
- Wrong password and tampered wrapped key both fail to unwrap, so they cannot be told apart and are reported as `WRONG_PASSWORD` ("Wrong password, or the vault file is damaged."). Once the vault key unwraps, any later failure (body fails its GCM check, bad JSON) is reported as `CORRUPTED`.
- **Superseded (2026-10-22):** this first version of the password change also generated a new vault key and re-encrypted the body. The Settings step reverted that to the original design (re-wrap the same vault key, leave the body untouched); the key-replacing path remains as an option. See "Settings sections, changing the master password, erasing the vault, About" below.

**File layout** (all in the app's private document directory, `vault.kvlt`)

```
offset  size   field
0       4      magic "KVLT" (0x4B 0x56 0x4C 0x54)
4       2      header length N, unsigned 16-bit big endian (1..4096)
6       N      header: UTF-8 JSON (below)
6+N     rest   body: AES-256-GCM of the vault JSON, iv (12) | ciphertext | tag (16)
```

Header JSON:

```json
{
  "formatVersion": 1,
  "kdf": {
    "algorithm": "argon2id",
    "version": 19,
    "memoryKiB": 65536,
    "iterations": 3,
    "parallelism": 1
  },
  "salt": "<base64, 16 bytes>",
  "wrappedKey": "<base64, 60 bytes = iv 12 | vault key 32 | tag 16>",
  "recovery": { "wrappedKey": "<base64, 60 bytes>", "createdAt": 1766400000000 }
}
```

- `recovery` is optional (added with the recovery key feature, 2026-10-22; see below). When present it must be well formed or the file is refused as damaged.
- `formatVersion` is the container format. The decrypted JSON has its own `version` (data model). A file with an unknown version of either is refused as `UNSUPPORTED_VERSION` rather than guessed at. Migrations will be added when version 2 exists.
- Base64 fields must be canonical or the file is rejected. KDF numbers are range-checked before any key derivation runs.
- **The header is not separately authenticated.** Changing the salt, KDF parameters or wrapped key makes unwrapping fail (so it cannot weaken anything), but it can make a good vault look like a wrong password. The body is not bound to the header either, so someone with write access to the file could swap in an older body from the same vault (rollback). Binding both would need AAD support in `encrypt`; consider it before format version 2.
- The decrypted body is `JSON.stringify(VaultData)` as UTF-8: `{ version, entries[], folders[], settings }`. Types are in `src/vault/types.ts`.

**Saving and crash safety** (`src/storage/vaultFile.ts`)

`expo-file-system`'s `move(..., { overwrite: true })` deletes the destination before renaming (checked in the library's Android source), so it is not atomic and a crash between the two steps would lose the vault. We therefore never use it. A save is:

1. write the new bytes to `vault.kvlt.tmp` and read them back to verify;
2. rename `vault.kvlt` to `vault.kvlt.bak`;
3. rename `vault.kvlt.tmp` to `vault.kvlt`;
4. delete `vault.kvlt.bak`.

Every rename goes to a free name, so it is a plain filesystem rename. At any moment `vault.kvlt` or `vault.kvlt.bak` is a complete vault. On every load, recovery runs: if `vault.kvlt` is missing or structurally invalid and a valid `.bak` exists, the `.bak` is restored; a leftover `.tmp` is always discarded (it was never reported as saved). A crash can therefore lose at most the save that was in progress, never the vault. The tests interrupt a save after each possible file operation and check the vault still unlocks with either the old or the new data.

Limits: `expo-file-system` has no fsync, so after a sudden power loss the operating system may still drop recently written data. The `.bak` fallback and the structural check cover a missing or truncated file, but not one that has the right length and wrong contents (that would show up as `CORRUPTED`). The `.bak` is deleted right after each successful save, so no copy under an old password is kept deliberately, but flash storage may not erase the old blocks.

**In memory**

- The vault key and decrypted data live in module variables in `src/vault/vault.ts`. The Zustand store holds only the decrypted `VaultData` (no keys), has no persistence middleware, and is set to `null` on lock.
- `lockVault()` zeroes the vault key and empties the data object (see the memory-wiping limits above; strings cannot be zeroed). Operations run one at a time, and a save seals the data in the same step in which it checks the vault is still unlocked, so a lock can never cause a save with a zeroed key.
- The vault store's `unlock`/`create`/`lock` also set the route-guard status in `useSessionStore`. The placeholder screens still set that status directly; they are wired to the vault store in a later step.

**Not yet verified on a device:** expo-file-system's real Android file operations. Tests use the jest-expo in-memory file system. Rename behaviour was checked by reading the library source, not by running it.

---

### 2026-10-21: Create-vault flow, password strength, and minimum length

- **Strength meter:** `@zxcvbn-ts/core` 4.2.0 with `language-common` 4.1.3 and `language-en` 4.1.1 (all MIT, pinned, released in 2026). It is the maintained TypeScript port of Dropbox's zxcvbn, runs fully on the device, and its dictionaries ship inside the app, so there is no network call. Scoring is capped at the first 128 characters so typing stays responsive. The English dictionaries add a few MB to the JS bundle; if startup time suffers, load them only when the create-vault screen opens.
- **Minimum length: 12 characters** (counted as characters, so an emoji is one). The strength meter is advice only: a long but weak password such as `password1234` is allowed, with a warning shown. Blocking on score would be a stricter policy; revisit if wanted.
- **Required acknowledgement:** the checkbox "If I forget my master password, my data cannot be recovered." must be ticked before the Create button enables.
- **Submit behaviour:** the button disables and shows a spinner while Argon2id runs (it runs on a native thread, so the UI stays responsive). On success it goes to the vault tab. On failure it shows a generic message and re-enables the button; the underlying error is never displayed or logged, because it could carry internals. If a vault already exists, it says so and re-checks app state so the user is routed to unlock.
- **Memory:** the typed password lives in React state, which is a JavaScript string and cannot be zeroed (see the memory-wiping limits above). It is released when the screen unmounts after a successful create.
- **App start:** the root layout now calls `useVaultStore.initialize()` before showing any screen (the splash screen stays up meanwhile), so an existing vault opens on the unlock screen instead of the welcome flow.
- **Settings > Lock vault** now calls the real `lock()` (wipes keys and decrypted data) instead of just changing the route status. The unlock screen is still a placeholder that does not check a password; it is replaced in the next step.

---

### 2026-10-21: Locking, unlock attempts, and auto-lock

**Unlock attempts** (`src/features/lock/attemptPolicy.ts`, `unlockService.ts`)

- The first 4 wrong passwords have no delay. From the 5th on, the wait before the next try is 30 s, then 1, 2, 4, 8 minutes, and 15 minutes from the 10th on. A successful unlock resets the count. Wrong password is the only error that counts; a missing or damaged vault file does not.
- All unlock attempts go through `unlockWithAttemptLimit`. It counts the attempt **before** checking the password, so killing the app mid-check does not give a free guess.
- The counter is a small JSON file (`unlock-attempts.json`) in the app-private folder, so closing or force-stopping the app does not reset it. A moved-back clock cannot shorten a wait (an earlier "last failure" time than now is treated as a full wait).
- **Honest limits:** this slows down guessing _on the phone through the app_. Someone who can read the app's private folder (a rooted phone or a malicious build of the app) can delete the file, and could instead copy `vault.kvlt` and guess offline, where only Argon2id and password strength protect the vault. We did not use the Android Keystore for the counter because it would not change that: whoever can delete the vault's neighbour files can also delete a keystore entry. Setting the phone's clock forward shortens a wait; there is no trusted clock offline.

**Auto-lock** (`src/features/lock/autoLock.ts`, `useAutoLock.ts`)

- Timing rules are a small pure module with an injected clock and timers, so every rule is unit-tested without React Native. The hook connects it to `AppState`, touches and typing.
- **Leaving the app:** lock after Immediately / 30 s / 1 min / 5 min (default 30 s). Android may pause JS timers in the background, so on return the app compares clock times and locks if the timeout has passed (or if the clock went backwards). Time away is measured from the first non-active state, so `inactive` followed by `background` is not double counted.
- **Inactivity while open:** lock after 1 / 2 / 5 / 10 / 15 minutes (default 5) with no touch or typing. Any touch anywhere (a passive `onTouchStart` on the root view) or a keystroke in any `TextField` resets the timer. Reading without touching the screen for the full period will lock; long hardware-keyboard-only or voice input outside a `TextField` is not detected.
- **Closing the app:** decrypted data exists only in memory, so killing the process wipes it, and the next launch always starts at the unlock screen (`initialize()` sets "locked" when a vault file exists). There is no separate code path to get wrong.
- **What locking does** (`useVaultStore.lock`): sets the store's `data` to `null`, zeroes the vault key, empties the decrypted data object, and sets the route status to "locked". The root layout then replaces the screen with `/unlock`; the route guard removes the vault screens from the navigation stack.
- Settings that change while the vault is open apply from the next event (the config is read when each timer starts).
- The vault file's own `settings.autoLockSeconds` field (inside the encrypted data) is **not used**; lock preferences live in the plain settings file below so they are available before unlock. It can be removed when the data format next changes.

**App settings file** (`settings.json`, app-private folder, not encrypted)

Holds only `backgroundLockSeconds` and `inactivityLockMinutes`. Invalid or missing values fall back to defaults field by field. It is written non-atomically because losing it only resets two preferences. Because it is not encrypted or authenticated, someone with file access could set the timeouts to the most permissive allowed values; the options are limited to the lists above (no "never").

---

### 2026-10-21: Biometric unlock (local Expo module `src/native/keystore`, Kotlin)

**Why a Kotlin module:** the Android Keystore and BiometricPrompt are not reachable from plain JavaScript, and the later Autofill service runs in the same app and must be able to use the same Keystore key. The key has a fixed alias (`kitevault_biometric_key_v1`) for that reason. `package.json` sets `expo.autolinking.nativeModulesDir` to `./src/native` so Expo finds the module there instead of the default `modules/` folder.

**How it works**

1. The vault key (32 random bytes, see the vault file format above) is encrypted by a hardware-backed AES-256-GCM key in the Android Keystore. That Keystore key:
   - needs a fresh Class 3 ("strong") fingerprint / face check for **every** use (`setUserAuthenticationRequired(true)`, timeout 0, `AUTH_BIOMETRIC_STRONG`; no PIN or pattern),
   - becomes permanently unusable when a new fingerprint / face is enrolled (`setInvalidatedByBiometricEnrollment(true)`),
   - is only usable while the phone is unlocked (`setUnlockedDeviceRequired`, Android 9+),
   - is created in StrongBox when the phone has it and silently falls back to the normal secure environment (TEE) when it does not.
2. The encrypted vault key is saved as `kitevault_biometric_blob.bin` in the app's private folder (written through `AtomicFile`). The IV is chosen by the Keystore, never by us.
3. To unlock, `BiometricPrompt` runs with the decrypt cipher as its crypto object. Only after the user passes does the hardware allow the cipher to run once. The decrypted vault key is returned to JavaScript, which opens the vault with it (`unlockVaultWithKey`) by decrypting the vault body; a wrong key simply fails the GCM check.
4. Turning it on also shows the system prompt once (an auth-bound AES key cannot even encrypt without it). This doubles as proof that the biometrics work.

**When the master password is required again** (enforced in Kotlin, `BiometricPolicy.kt`, counted from the last time the master password was typed):

- after the phone restarts (the boot counter changed, or the elapsed-time clock went backwards),
- after 7 days (measured with the elapsed-time clock, so changing the date or time does not extend it),
- after 5 successful biometric unlocks (the 6th needs the password).

Typing the master password correctly (`recordPasswordUnlock`, called from `unlockWithAttemptLimit`) restarts all three counters without needing another fingerprint prompt. The counters are in private SharedPreferences; the policy is unit tested (`BiometricPolicyTest.kt`).

**Key lifecycle**

- A normal password change now keeps the same vault key (see 2026-10-22), so biometric unlock keeps working. If the vault key is ever replaced (the `rotateVaultKey` option), the stored one becomes stale: the store then turns biometric unlock off, and if a stale key is used anyway the vault refuses it (`WRONG_KEY`), the stored key is removed, and the user is told.
- If biometrics change (`KeyPermanentlyInvalidatedException`) or are all removed, the Keystore key, the blob and the counters are deleted and the unlock screen explains why. The same cleanup runs if the blob cannot be decrypted.
- A half-finished setup (user cancels during "turn on") deletes the new key, so no usable key is left without a stored blob.
- A wrong finger does not count as a result: the system dialog stays open. After too many wrong tries the system locks biometrics out for a while; we show "Too many failed biometric attempts" and the master password keeps working.
- "Turn off" and "Don't ask again" are in Settings / the offer dialog; the choice "Don't ask again" is saved in the plain settings file.

**Risks and limits (please read)**

- **The vault key crosses into JavaScript** when biometrics unlock the vault, exactly as it does after a password unlock. Anything said about wiping memory in the earlier decision applies: the Kotlin side hands the bytes over, and we cannot guarantee every copy in the JS engine and the bridge is erased. We wipe our JS copies and zero the Kotlin array where we can.
- **Biometric unlock is weaker than the master password.** Anyone who can pass the phone's fingerprint / face check (a sleeping owner, a coerced owner, a sibling whose face is enrolled) can open the vault, subject to the 5-unlock / 7-day / restart limits. Class 3 sensors make spoofing hard but not impossible. This is a convenience feature; users who need more should leave it off.
- **Only Class 3 biometrics count.** Phones with only Class 2 face unlock (many budget phones) will show it as unavailable. This is intentional.
- **It does not protect a copy of the vault file.** The Keystore key never leaves the phone, so the blob is useless elsewhere, but a stolen copy of `vault.kvlt` is still only protected by the master password and Argon2id.
- **Rooted or compromised phones** can hook the app and read the key after a legitimate unlock. Keystore hardware protects the key at rest, not from code running inside our own process.
- **Verified so far:** the Kotlin module compiles under Gradle against Expo SDK 58 and `BiometricPolicyTest.kt` passes (7 tests); the JavaScript side is covered by unit tests against a fake native module. **Not verified:** anything that needs real hardware, namely the system fingerprint dialog, StrongBox versus TEE key creation, invalidation after enrolling a new fingerprint, and the Expo ByteArray bridge. Try these by hand on at least one phone before relying on the feature.

---

### 2026-10-21: Android protections (screenshots, clipboard, backup, root warning)

**Screenshots, recording and the recent-apps preview** (`expo-screen-capture`, `src/features/privacy`)

- `preventScreenCaptureAsync` sets Android's `FLAG_SECURE` on the app window. That one flag blocks screenshots, blocks screen recording and casting to non-secure displays, and blanks the thumbnail in the recent-apps list.
- It is switched on at startup, before the first screen, so there is no unprotected moment. If the Android activity is not ready yet, the call is retried for about two seconds.
- Setting **Allow screenshots** (default **off**) only affects the _unlocked_ vault. **Deliberate addition:** the create-vault and unlock screens are always protected, even if screenshots are allowed, because a screenshot could capture a master password revealed with "Show". Locking turns protection back on immediately.
- `FLAG_SECURE` cannot stop someone photographing the screen with another camera, and a rooted phone can bypass it.

**Clipboard** (`expo-clipboard`, `src/features/clipboard`)

- `copySecret(value)` copies, shows the Android toast "Copied, clears in 30 s" (or 15 / 60 s; "Never" says the value stays), then clears after the delay **only if the clipboard still equals what we copied**. Delay setting: 15 s, 30 s (default), 60 s, Never.
- Android 10+ lets only the foreground app read the clipboard. If the delay ends while the app is in the background we cannot check, so we do nothing and finish the check the moment the app returns to the foreground (this uses clock times because JS timers can be paused in the background).
- If the clipboard cannot be read we leave it alone rather than wiping something the user may need.
- **Limits:** if the app is killed before the timer ends, nothing is left running to clear the clipboard. The copied value is held in memory until it is cleared. We do not store a hash of it, because a stored hash of a weak password could be guessed offline. Android 13+ shows a preview of the copied text in its clipboard pop-up; `expo-clipboard` has no option to mark the clip as sensitive (`EXTRA_IS_SENSITIVE`), so the preview can show a copied password. Marking it sensitive would need a small addition to our Kotlin module; do this before shipping.
- No screen has copy buttons yet (the entry screen is still a placeholder). `CopyButton` and `copySecret` are ready to use there.

**Backup and device transfer** (`app.json` + `plugins/withNoBackup.js`)

Three settings work together, and a unit test fails if any is removed:

1. `android.allowBackup: false` in `app.json`. This is the master switch.
2. `android:dataExtractionRules="@xml/kitevault_data_extraction_rules"` (Android 12+). Excludes every storage area, normal and device-protected, from both `<cloud-backup>` and `<device-transfer>`.
3. `android:fullBackupContent="@xml/kitevault_backup_rules"` (Android 11 and older). Excludes every storage area.

The plugin adds the two attributes to the manifest and writes the two XML files into `android/app/src/main/res/xml/` on every prebuild / EAS build. They are not edited by hand, because `android/` is generated.

How to verify (also in the hand-off message): check the merged manifest of the built app, then ask the phone.

**Permissions** (found while checking the merged manifest)

The default Expo template added `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` and `SYSTEM_ALERT_WINDOW`, and `expo-screen-capture` added `READ_MEDIA_IMAGES`. A password manager has no use for them, so they are blocked in `app.json` (`android.blockedPermissions`). The release app now requests only: `INTERNET`, `USE_BIOMETRIC`, `USE_FINGERPRINT`, `VIBRATE` and `DETECT_SCREEN_CAPTURE` (a harmless normal permission added by the screen-capture library, unused). `INTERNET` is still there for the future Drive backup and breach check (CLAUDE.md rule 3); until those exist it could be blocked too, but debug builds need it for the development server. Debug builds also add network-state and overlay permissions for the dev tools; release builds do not.

**Root warning** (`jail-monkey` 3.0.0, `src/features/security`)

- Chosen over `expo-device`'s `isRootedExperimentalAsync`, which only checks for the `test-keys` build tag and `/system/xbin/su`; that misses Magisk and most modern roots. `jail-monkey` (MIT, updated April 2026) runs RootBeer's checks: su binaries, Magisk, root-manager apps, dangerous system properties, writable system paths and test-keys. It needs no extra permission and makes no network calls (checked in its source). `freeRASP` was rejected because it reports to a vendor service, which conflicts with the no-network rule.
- A banner appears above every screen on a device that looks rooted. It warns only; it never blocks and can be dismissed for the session.
- **Limits:** root hiding (Magisk DenyList, Shamiko and similar) can defeat these checks, so "no warning" does not mean "not rooted". If the library cannot run we show nothing rather than a false alarm. Jail-monkey also pins an old RootBeer (0.1.1).

---

### 2026-10-21: Vault list, entries, trash and folders (`src/features/entries`)

**Data model.** `Entry` gained three optional fields, so vault data version 1 is unchanged and existing vaults still open: `card` (holder, number, expiry MM/YY, security code, PIN), `identity` (full name, email, phone, address) and `deletedAt` (epoch ms, set when the entry is in the Trash). Each type uses its own fields: a login has username, password and websites; a secure note only has text; cards and identities have their own blocks. `formToEntry` drops fields that do not belong to the chosen type, so a note never keeps a stale password. The type cannot be changed after an entry is created. `totpSecret` is preserved on edit but has no form field yet.

**Saving.** Every change goes through `mutateVault()` in `entryActions.ts`:

- changes run strictly one after another, each on the newest data, so two quick edits (or an edit during a slow save) can never overwrite each other with an old copy;
- the change is saved with `saveVault()` first, and only a successful save updates what the screens show. On failure the previous data stays in memory and on disk, the error is thrown, and the screen shows "Your change could not be saved, so nothing was changed" (the form stays open with everything typed). Error text never contains the underlying error;
- nothing is saved if a change produces no difference (for example emptying an empty Trash).

**List.** The list is a `FlatList` with fixed-height rows, `getItemLayout`, memoized rows (`memo` plus a stable open callback) and a small render window (12 initial rows, window of 7 screens, clipped off-screen views). Search runs in memory over title, username and websites (not passwords or notes); every typed word must match; the lowercase search text is cached per entry in a `WeakMap`, which is safe because an edit replaces the entry object. Typing uses `useDeferredValue` so the text box never waits for the list. Filters: favorites, entry type, and folder (a folder, "No folder", or all), combinable with the search. Sorting is favorites first, then A to Z, computed once per change of the entries (not per keystroke).

**Speed check (what was and was not measured).** A dev-only pair of buttons ("Seed 2,000" and "Remove seed") adds or removes 2,000 fake entries in a single save (deterministic data, ids start with `seed-`, no randomness). Automated tests confirm that with 2,000 entries only a small window of rows is drawn, sorting takes well under 150 ms and a search under 100 ms on a development computer. **These are not phone measurements.** Try the seed button on a real, mid-range phone and judge scrolling and typing by feel; the numbers to watch are the first open after unlock and typing in the search box. The buttons only exist when `__DEV__` is true, so they do not appear in release builds. Seeding writes about 1 MB of encrypted data in one save, which is also a useful check of save time.

**Trash.** Deleting asks for confirmation and moves the entry to the Trash (`deletedAt`). The Trash screen shows days left, and can restore, delete forever (confirmation), or empty the Trash (confirmation). Entries older than 30 days are removed for good when the vault list opens (only if there are any, so it usually causes no write). Trashed entries are hidden from search, folders' counts, and the detail screen. The Trash lives inside the encrypted vault, so it is as protected as everything else.

**Folders.** A separate screen adds, renames and deletes folders (names: 1 to 50 characters, unique ignoring case). Deleting a folder never deletes entries; they become "no folder".

**Detail screen.** The password, card number, security code, PIN and hidden custom fields start hidden every time the screen opens (and the screen is gone when the vault locks). Copy buttons use the auto-clearing clipboard from the earlier decision. "Open" accepts only `http` and `https`: a bare address like `example.com` becomes `https://example.com`, and anything with another scheme (`javascript:`, `intent:`, `file:`, `tel:`, `mailto:` ...) is refused, because the website field is user data and could have come from an import.

**Forms.** `react-hook-form` 7.90.0, `zod` 4.6.7 and `@hookform/resolvers` 5.2.2 (all pinned). The resolvers 6.0.0 release was not used because npm could not resolve its optional peers. Validation: title required; websites must be valid http(s) (empty allowed); card number 12 to 19 digits, expiry `MM/YY`, security code 3 to 4 digits; identity email valid; a custom field with a value needs a name; length limits everywhere. Rules for a type only apply to that type. Old passwords go to the password history (newest first, at most 10) whenever the password changes.

**Memory.** Locking now also blanks card and identity details (field by field) and drops password history. As before, JavaScript strings that were already read (for example text shown on screen) cannot be zeroed; see the earlier limits.

---

### 2026-10-21: Password and passphrase generator (`src/features/generator`)

**Randomness: secure only, no modulo bias**

- Every random choice comes from `generateRandomBytes` in `src/crypto` (OpenSSL's secure generator through `react-native-quick-crypto`). `Math.random()` is not used anywhere, and a test fails if it is called during generation.
- `createUniformPicker().pick(n)` returns an integer from 0 to n-1 with **rejection sampling**, not `value % n`. It reads 32 random bits; if the value is at or above the largest multiple of n that fits in 2^32, it is thrown away and a new value is drawn. Every result is then exactly equally likely. (Plain `% n` favours the small results whenever n does not divide 2^32; for n = 90 characters the bias is tiny but real, and we do not accept any.)
- The tests prove this exactly rather than statistically: `reduceUniform(value, n, range)` is run on every possible value of a 256-value range for many n, and all results must come out with identical counts and exactly `256 % n` rejected values. A companion test shows the naive `% n` version fails the same check (counts 86/85/85), so the test is known to be able to catch the bug. Chi-square checks on the real generator back it up.
- Random bytes are fetched 256 at a time (64 draws per native call); unused bytes are wiped when the generator finishes (best effort, as everywhere in JavaScript).
- The shuffle is Fisher-Yates using the same unbiased picks.

**Passwords.** Length 8 to 64; uppercase, lowercase, numbers, symbols switches (at least one must stay on); optional "avoid look-alikes" (leaves out `I l 1 | O 0 o`). Symbols are `!@#$%^&*()-_=+[]{};:,.<>?/~`, deliberately without quotes, backslash, backtick or space, which many sites and forms mangle. One character from every selected group is always included (sites often require it), the rest are drawn from all selected groups, then everything is shuffled. Because of the "at least one of each" rule the number of possible results is slightly smaller than `pool^length`; the strength figure uses the exact count (inclusion-exclusion), which is an upper bound on the real randomness.

**Passphrases.** 3 to 10 words from the **EFF Large Wordlist** (7,776 words, chosen to be easy to read and type, with no very short or confusing words), bundled in `wordlist.ts`; no network access. Licence: CC BY 3.0 US (attribution is in the file header; changes: dice numbers removed). We removed the 4 hyphenated words (`drop-down`, `felt-tip`, `t-shirt`, `yo-yo`) so a `-` separator is never ambiguous, leaving **7,772 words, 12.92 bits per word**. The list was checked on import (7,776 unique lines in the expected format) and its original SHA-256 is recorded in the file header (`addd3553...`). Options: separator (`-`, space, `.`, `_`), capitalize each word (adds no randomness), and an optional single digit added to one random word (adds the digit and its position). Six words is about 77 bits, seven about 90.

**Strength indicator.** For text we generate ourselves we know exactly how random it is, so the meter uses bits of randomness (under 28 very weak, under 40 weak, under 60 fair, under 80 good, 80 or more strong) and shows the number. The zxcvbn estimator used for typed master passwords is not used here: it scores common words by their popularity, so it would badly under-rate a passphrase of randomly chosen words. 80 bits is far beyond any realistic offline attack; the default 20-character password is about 128 bits.

**"Use this password".** The entry form (logins only) has a "Generate a password" button that opens the same generator panel inline, with a "Use this password" button. The value goes straight into the form field in memory; it is never put in a route parameter, a link or any shared store, where it could linger in navigation history. The field stays hidden. If the entry already had a password, saving moves the old one into the password history.

**Slider.** `@react-native-community/slider` 5.2.1 (the version Expo SDK 58 pins). It is a native component, so the development build must be rebuilt once. The generator's settings are not remembered between visits (defaults: 20 characters, all four kinds on).

**Limits.** A generated password that is shown on screen is in the JavaScript heap as a string and cannot be wiped; the screen is also covered by the screenshot protection while the vault is unlocked. Copying uses the auto-clearing clipboard from the earlier decision.

---

### 2026-10-22: Settings sections, changing the master password, erasing the vault, About

**Changing the master password: re-wrap only (this reverses an earlier choice).**
Earlier (vault file format decision) a password change also created a new vault key and re-encrypted the vault body. The brief for the Settings screen asks for the original design: re-wrap the vault key and do not re-encrypt. That is now the default:

1. the current password is checked (derive its key, unwrap, compare with the key in use);
2. a fresh salt and the current default KDF settings give the new password key (so the stored cost is upgraded as a side effect);
3. the **same** vault key is wrapped with the new password key;
4. the file is written again with the **encrypted body byte for byte unchanged** (the session keeps the body exactly as it is in the file, so there is nothing to encrypt), through the same atomic temp-file-then-rename save as every other write. A test cuts the operation off after each possible file operation and checks the vault always opens with either the old or the new password.

Consequences: it is faster; **biometric unlock keeps working** after a password change (the vault key it stores has not changed), and the biometric counters restart because the user just typed their password.

What is given up: if someone knew the _old_ password and also kept a _copy of the old file_, they can unwrap the vault key from that copy and use it on any later version of the file, because the key never changed. Replacing the key would stop that, but only for later copies, and only if the old password was the thing that leaked. The code for it still exists (`changeMasterPassword(old, new, { rotateVaultKey: true })`, which also turns biometric unlock off because the stored key becomes stale), is tested, and is not used by any screen. To switch back, pass that option in `ChangePasswordForm`.

The form asks for the current password, the new password (12+ characters, live strength meter) and a confirmation, refuses a new password equal to the current one, and shows a loading state while the two key derivations run. It shares the **unlock attempt counter and delays**: wrong current passwords count like wrong unlock tries (5 free, then 30 s, 1 min, ...), so a person holding an unlocked phone cannot guess the master password there without limit, and cannot lock the owner out by changing it. Errors never include the underlying cause.

**Erasing the vault.** Settings > Data has a red "Erase vault" button. It opens a dialog with the exact text "This will permanently erase all passwords on this device. This cannot be undone." and a field; the final button stays disabled until the field holds exactly `ERASE` (capitals required, no spaces). It then:

1. deletes the vault file and its temporary and backup copies, **inside the same queue as saves**, so a save that was already waiting cannot recreate the file; it checks that none of the three files exist (it looks without the usual recovery step, which would otherwise restore a leftover backup) and retries once;
2. only if that worked: deletes the biometric key from the Android Keystore, the encrypted copy of the vault key and the biometric counters;
3. deletes `settings.json` and the unlock-attempt counter and resets the settings in memory to the defaults;
4. last, empties the store and sets the app state to "no vault"; the root layout then sends the user to the welcome screen.

If step 1 fails, the dialog stays open with an error, nothing else is touched and the vault stays unlocked. Creating a vault now also removes any biometric key left over from an earlier one. **Limit:** deleting a file does not overwrite its contents; on flash storage the old bytes may remain until reused. They stay encrypted with a key derived from the master password. A phone factory reset (or uninstalling the app, which removes its private folder) is the stronger option.

**Data section.** Shows the required note: "Uninstalling the app also deletes all local data. If you enabled cloud backup, your encrypted backup stays in your Google Drive until you delete it." **Backup** is a placeholder card.

**About.** Shows the version (from the app config), "by Kitelux", a short privacy statement (data stays on the phone, AES-256-GCM with a key from the master password via Argon2id, no accounts / analytics / tracking / ads, the only internet features are optional and not yet available) and the open source licenses.

**License list.** `npm run licenses` (`scripts/generate-licenses.js`) reads the libraries listed under `dependencies` in `package.json` and writes `src/features/about/licenses.generated.ts` with each name, version, license and license text (identical texts stored once). A test fails if a dependency is missing from the list or has an unknown license, so the list cannot silently go out of date; run the script after changing dependencies. Four packages (`@react-native-community/slider`, `expo-router`, `react-native-nitro-modules`, `react-native-quick-crypto`) declare MIT but ship no license file; the screen says so and links to the project page rather than inventing a copyright line. **Only direct dependencies are listed**, each with its own dependencies under their own (mostly MIT) licenses. Components that are not npm packages are added by hand in `extraLicenses.ts`: the EFF word list (CC BY 3.0 US attribution), OpenSSL, AndroidX Biometric, RootBeer and Hermes. Before publishing, have the full third-party notice checked, including the Apache 2.0 notices for those native components.

---

### 2026-10-22: Optional recovery key

**What it is.** A second way to open the vault, made only if the user asks for it (Settings > Security > Recovery key). It is 256 random bits from the secure generator. The vault key is wrapped with it exactly like it is wrapped with the master-password key (AES-256-GCM), and the result is stored as an extra entry in the file header:

```json
"recovery": { "wrappedKey": "<base64, 60 bytes = iv 12 | vault key 32 | tag 16>", "createdAt": 1766400000000 }
```

The header field is optional and the format version stays 1: old files simply have no `recovery`, and a reader that does not know the field ignores it. The encrypted body is never touched by any recovery operation. No key derivation is needed for the recovery key, because it already has 256 bits of randomness (Argon2id is for guessable passwords). The recovery key itself is **never stored**: not in the file, not in settings, not in the Keystore. Only the user's written copy exists. A test checks that neither the key bytes nor any group of its text appear anywhere in the vault file.

**What the user writes down.** 32 bytes of key + a 3-byte checksum = 35 bytes = 280 bits = 56 characters of Crockford base32, shown as **8 groups of 7 characters** (`XXXXXXX-XXXXXXX-...`). The alphabet is digits and capitals without I, L, O and U, so nothing is confusable. Typing it back ignores case, spaces and hyphens, and reads O as 0 and I / L as 1. The checksum is the first 3 bytes of SHA-256 of a fixed label plus the key (SHA-256 from the same vetted native library; the base32 step is plain encoding, not cryptography). It lets the app say "there is a typing mistake" before trying anything: a test tries all 1,736 possible single-character mistakes, all neighbouring swaps and swapped groups, and none is accepted; a random mistake could slip through only about 1 time in 16 million. It reveals 24 bits of a hash of the key, which leaves 232 bits to guess.

**Creating it** (`RecoveryKeyCreateScreen`):

1. A red warning first: **"Anyone with the recovery key can open your vault."**, plus that it works instead of the master password and must be kept offline, never as a screenshot, photo, note or in the cloud. If one already exists, it says the new one replaces it and the old key stops working.
2. The current master password is required (through the shared unlock attempt counter, so it cannot be guessed without limit). Showing a key that opens the vault is as sensitive as changing the password.
3. The key is generated and shown in memory only, as 8 numbered groups. **Nothing is stored yet.** To finish, the user types one randomly chosen group from their written copy; this catches a copy that was not written down or was written down wrongly. Only then does "Finish" write the header entry (atomically, same save as everything else). Leaving the screen earlier discards the key, so the app can never hold a recovery key the user never saw. If saving fails, the same key stays on screen so a paper copy that was already made stays valid.
4. The screen is **forced to be screenshot-proof** (`FLAG_SECURE`) even if "Allow screenshots" is switched on, and there is no copy button, so the key cannot reach the clipboard from here.

**PDF export.** "Print or save as PDF" first shows a warning (keep it offline, no cloud storage, no email, never a screenshot or photo, anyone who gets it can open the vault), then opens the Android print screen with `expo-print` (`printAsync`), where the user can print or choose "Save as PDF". `printToFileAsync` was deliberately not used: it would leave a PDF containing the key in the app's cache folder. The page has the 8 groups, the date, the warning and instructions; it has no scripts, no images, and no internet links. **Limits:** once the user chooses where to save the PDF, protecting it is up to them, and the Android print spooler may keep temporary data of its own; a printed paper copy kept offline is safest.

**Forgot master password** (`/recover`, link on the unlock screen). The user types the key (masked, with Show; a live counter and "looks right" / "typing mistake" hint as they go) and chooses a new master password (12+ characters, strength meter). The app: reads the header, unwraps the vault key with the recovery key, **checks that it really decrypts the vault body**, then makes a fresh salt, wraps the same vault key with the new password, and writes the file back with the body unchanged, atomically (a test cuts the operation off after every possible file operation: afterwards the old or the new password always works, and the recovery key still does). Errors are specific: typing mistake, "this vault has no recovery key" (with the honest advice that the only way to start over is to clear the app's data or uninstall), "this key does not open this vault" (for example an older key that was replaced), damaged file. The recovery key is not rate-limited: it has 256 bits, so guessing is pointless, and a typo is caught by the checksum before anything is tried. After a successful recovery the unlock delay and the biometric counters restart.

**Interactions.**

- A normal master-password change keeps the recovery key valid (the vault key does not change); so does saving, and biometric unlock keeps working after a recovery.
- The optional `rotateVaultKey` mode replaces the vault key, which cannot be re-wrapped for a recovery key that is not stored, so it **drops** the recovery entry (tested). Nothing in the UI uses that mode.
- "Remove recovery key" in Settings deletes the header entry (with a confirmation); the written copy is then useless.
- Using the recovery key does not retire it. After recovering, the key still opens the vault; the app suggests making a new one if the user thinks anyone saw it.

**Risks to keep in mind.** A recovery key is a second password with no brute-force delay: anyone who finds the paper, or the PDF, can open the vault from a copy of the file. It also removes the guarantee "if you forget your password, the data is gone": that is why it is optional, off by default, behind a warning and the master password. The typed text of the key lives in JavaScript strings (the screen state) until the screen closes; it cannot be wiped, as with passwords. The key is not escrowed anywhere: lose the paper and the password, lose the vault.

---

### 2026-10-22: Optional Google Drive backup

Setup instructions (Google Cloud project, Drive API, consent screen, SHA-1 fingerprints) are in `docs/GOOGLE_SETUP.md`.

**Off by default.** `plugins/withGoogleBackup.js` takes `enabled` (default `false`) and an optional `webClientId`; it writes them to `extra.cloudBackup`, and the app reads them at run time. With `enabled: false` there is no backup card, no "Restore from Google Drive" button, and every backup function refuses before any sign-in or network code runs (tested). This keeps CLAUDE.md rule 3 (network only for the optional backup and breach check) true for any build that has not been through the Google setup. The library's own Expo plugin was **not** used: on Android without Firebase it does nothing (it either wants a `google-services.json` or an iOS URL scheme), and `expo install` had added it to `app.json`, so I removed that entry. A Web client ID is not needed because the app never asks for an ID token.

**Library.** `@react-native-google-signin/google-signin` 16.1.5 (MIT, the free "original" edition, updated September 2026). It compiles against this React Native under Gradle. **Risk to know about:** on Android it uses Google's older `GoogleSignInClient` / `GoogleAuthUtil` APIs (`play-services-auth` 21.4). Google has marked that sign-in API as deprecated in favour of Credential Manager and the Authorization API. It works today, but a future Play services or library change could force a migration. The library is loaded lazily, only when a backup function is called, so a build or test without it still starts.

**Permission asked for.** Exactly one Drive permission, `https://www.googleapis.com/auth/drive.appdata`. Google Sign-In always adds the basic identity (name, email, picture) so the app can show which account is signed in. No other scope is requested anywhere. If the user unticks the Drive permission on the consent screen, sign-in asks once more and then reports "scope denied".

**What is uploaded.** The vault **file**, byte for byte, as it is on the phone. It is already encrypted (AES-256-GCM body, Argon2id-wrapped key). Backing up needs no key and no password, works while the vault is locked, and never decrypts anything. A test checks that no password, username or title appears in anything sent. The recovery-key entry in the header travels with it (it is a wrapped copy of the vault key and useless without the recovery key). A file that is not a well-formed vault is never uploaded.

**Drive client.** About 150 lines of plain `fetch` (`driveApi.ts`) against the Drive v3 REST API: list, create (a single multipart request, so the file arrives whole or not at all), update, download, delete, all inside `appDataFolder`. One file, `kitevault-backup.kvlt`; each backup replaces it. There is no history: a bad backup replaces a good one, which is why only well-formed files are uploaded. Tokens are used only in the `Authorization` header and are never stored or logged by us.

**When it backs up.**

- Manually: Settings > Backup > "Back up now".
- Automatically (opt-in, off by default): every successful write of the vault file (a save, a password change, a recovery-key change) marks the vault as "pending" and starts a 20-second countdown that restarts on the next save, so a burst of edits becomes one upload. Going to the background uploads immediately. An upload that failed (offline, signed out, ...) stays pending and is tried again on the next save, when the app returns to the foreground, or by hand; it never loops. The pending flag is saved, so it survives the app being closed, and is retried at the next start.
- The first backup runs right after the user signs in.

**Never silently overwrite someone else's backup.** The phone remembers the Drive file it last uploaded to and that file's `modifiedTime`. If the cloud holds a file that does not match (a new phone with a new vault, a reinstall, or another phone that backed up since), the upload stops with a "conflict", automatic backup pauses, and the card offers "Replace the cloud backup with this phone" behind a confirmation. This protects the main failure case: reinstalling, creating a fresh vault instead of restoring, turning backup on, and destroying the only copy of the old vault.

**Restoring** (welcome screen > "Restore from Google Drive"). Sign in, find the backup, and only then ask for the master password. The screen states: "Signing in with Google only finds your encrypted backup. It cannot open your vault. You need your master password to decrypt it." Nothing is downloaded until a password is typed. The download is checked to be a well-formed vault file, then `restoreVaultFromBackup` derives the key, unwraps the vault key, **decrypts the body to prove the password is right**, and only then writes the file (exactly the downloaded bytes, atomically) and unlocks. A wrong password changes nothing and does not download again on retry. It refuses if a vault already exists on the phone. Wrong tries share the unlock attempt counter (5 free, then growing delays). Afterwards the phone tracks that cloud file so its next backup is not mistaken for a conflict; automatic backup stays off until the user switches it on.

**Sign out / delete.** "Sign out" signs out of Google, forgets the backup settings, and leaves the backup in Drive (the screen says so). "Delete cloud backup" asks first, deletes every KiteVault backup file in the hidden folder, switches automatic backup off (otherwise the next save would quietly create a new one) and keeps the sign-in. "Erase vault" also signs out on the phone but does not touch the cloud copy, as the Data note says. Revoking access entirely is done in the Google account settings.

**Problems handled** (each has a plain message and a test): no internet, or a request that never answers (20 s and 60 s limits); an expired token (refreshed once, then the request is repeated; a second rejection means "sign in again"); the user removing KiteVault's access in their Google account (Drive 403, or no token can be had); Drive full (`storageQuotaExceeded`); rate limiting (429 and the rate-limit reasons); the Drive API switched off in the project, or a package name / signing key that does not match Google Cloud (shown as "not set up correctly for this build"); Google Play services missing; the backup file missing or deleted since (a missing file during an update makes a new one, during a delete it is ignored); a damaged or newer-format backup. Error text never contains a token, a URL or any text from Google's reply.

**What cloud backup does to the threat model (please read).** The encrypted file now exists in a Google account. The master password and Argon2id are then the **only** protection against someone who gets that file: Google itself, an attacker who takes over the Google account, or a court order. They can guess passwords offline at whatever speed their hardware allows, with no lockout delay (the on-phone delay does not apply to a copy of the file). A long, random master password matters much more once backup is on; the passphrase generator is the easy way to get one. The header also reveals the salt, the Argon2 settings and whether a recovery key exists. Nothing else in the file is readable. Because there is no history, a mistaken edit that was backed up replaces the good copy.

**Google OAuth verification.** As far as I know (check the console, I cannot see your project), `drive.appdata` is listed by Google as a **non-sensitive** scope, together with `drive.file`. Apps that request only non-sensitive scopes do not go through Google's sensitive/restricted-scope review (no security assessment, no demo video). What still applies:

1. While the consent screen is in **Testing**, only listed test users (up to 100) can sign in, and sign-ins expire after about 7 days. You must press **Publish app** before real users install it.
2. Google's **branding verification** can apply if you add a logo or a custom domain, so the safest path is no logo at first.
3. The **Verification Center** page of your project says exactly what Google currently requires.

The sensitive scopes that would trigger a review (for example full `drive`) are never requested.

**Google Play Data Safety form.** This is my understanding and not legal advice; Google's definitions change, so check the current Play Console help text before submitting. Points for the form:

- Is data **collected** (sent off the device)? Only if the user turns on the optional backup, and then the encrypted vault file goes to the user's own Google Drive. Nothing is sent to Kitelux servers; there are none. Declare this optional feature honestly: data type **Files and docs** (the encrypted vault file), purpose **App functionality**, **optional** (the app works without it), **encrypted in transit** (HTTPS), and note that the contents are encrypted on the device before upload.
- **Shared with third parties**: the file goes to Google at the user's request and is stored in the user's own account. Play treats a transfer that the user starts to a service of their choice differently from sharing for the developer's own purposes; whether to tick "shared" is a judgement to confirm in the current Play guidance. KiteVault shares nothing for advertising or analytics.
- **Email address / name / user IDs**: Google Sign-In shows the account email on the phone; it is not sent to Kitelux. The Google Sign-In SDK is Google's own component; list it if the form asks about SDK data practices.
- **Passwords and the master password**: never leave the device, never collected.
- **Data deletion**: the user can delete the backup inside the app ("Delete cloud backup") or in Drive settings under "Manage apps". The app has no account of its own, so Play's in-app account-deletion requirement does not apply, but a **privacy policy URL is required** for an app that handles passwords, and it should describe the optional backup.
- **No analytics, ads or tracking SDKs** (CLAUDE.md rule 3): say so.
- Keep the declared permissions in line: the release manifest requests `INTERNET`, `USE_BIOMETRIC`, `USE_FINGERPRINT`, `VIBRATE` and `DETECT_SCREEN_CAPTURE`; backup added none (checked in the merged manifest).

**Not verified.** The Google sign-in dialog, the Drive permission screen, real token expiry and the Google Cloud setup could not be run here. Everything above the Google library is tested against a pretend Google and Drive (`__support__/fakeGoogle.ts`), including the exact URLs, headers and request bodies; the native library compiles under Gradle.

## Backup versions, conflicts, merge and history

**Versions.** Up to 5 versions are kept in the hidden app folder, each a separate file with the same name and labels in Drive "app properties": `revision`, `deviceId`, `deviceName` (plain labels, not secret; the time is Drive's own `createdTime`/`modifiedTime`). After every upload the oldest beyond 5 are deleted (a failure to tidy up does not fail the backup).

- **Deviation worth knowing:** an _automatic_ backup made by the same phone within 30 minutes of that phone's newest version replaces that version instead of adding one. Otherwise a few bursts of editing would push every older version out of the five slots within minutes. Manual backups, "keep this device's version", merges and safety copies always add a version.
- **Device name** is the phone model plus 4 characters of a random per-install id (`Pixel 8 (a3f9)`). The name the user gave the phone is deliberately not used: labels are not encrypted and that name often holds a real name. The id is random, not the Android id, and lives in `settings.json`.

**Revision number.** `backupLocalRevision` goes up by one on every save of the vault file while backup is on (never down). Each upload is labelled with it. `backupRemoteId/Modified/Revision` remember the cloud version this phone last uploaded or downloaded ("seen").

**Before every upload** (`compareWithCloud`, a pure function): the newest cloud version is compared with "seen".

- same file, same modified time, same revision: safe to upload;
- never seen (new install, other vault): conflict `unrelated`;
- changed since seen and this phone has no newer revision: `remote-ahead`; and with local edits too: `diverged`. Both stop the upload, nothing is overwritten and the Settings card shows "Resolve";
- cloud modified time _older_ than seen (a newer version was deleted): not a conflict, uploading only restores it.
  Automatic uploads stay blocked while a conflict is open.

**Conflict choices.** _Keep this device's version_ uploads as a new version (theirs stays in history). _Use cloud version_ replaces the local vault; it needs the cloud version's master password (it may have been changed elsewhere), is verified by decrypting before anything changes, and removes the biometric key if the vault key changed. _Merge_ decrypts the cloud copy in memory (same password check), merges, saves locally, uploads the result as a new version with a revision above both.

**Merge rules** (`src/vault/merge.ts`, 32 tests): by entry id; newest `updatedAt` wins (tie: this phone). If both phones changed the entry since the last time they agreed (`backupLastAt`) and the content differs, the loser is kept as an extra "(conflicting copy)" entry (deterministic id, so merging twice does not duplicate). Password histories are combined. Deleted on one side: an edit made after the deletion wins (entry stays alive); otherwise it stays in the Trash with the newest content, never erased. Folders are unioned by id. Settings are not merged. **Known limit:** an entry removed from the Trash for good on one phone comes back from the other (nothing is ever silently deleted, by design); both vaults must have the same data version.

**History.** Lists the versions (time, phone, revision). Restoring needs that version's master password (checked first). If this phone has changes the cloud lacks, the current vault is uploaded as a new version first, so a restore can be undone.

**Not verified here:** real Drive behaviour of app properties (the 124-byte limit is respected and tested against the fake) and clock skew between phones (Drive's own times are used for comparing cloud versions, but entry `updatedAt` comes from each phone's clock, so a phone with a wrong clock can win or lose a merge unfairly).

## Import and export (Settings, Data)

**Libraries.** `expo-sharing` (hand a file to another app), `expo-document-picker` (choose a file), `papaparse` (CSV reading and writing; plain JavaScript, no network). `expo install` added the `expo-sharing` _config plugin_ to `app.json`; it is for receiving shared files (it adds share-target intent filters), which KiteVault does not want, so it was removed again. Sharing a file out needs no plugin.

**Export.**

- _Encrypted (.kvault)_: the vault file exactly as stored (same format as `vault.kvlt`, see "Vault file format"), so nothing is decrypted or re-encrypted and it stays protected by the master password (and recovery key, if set) the vault has _now_. After a later password change the file still needs the old password; the screen says so.
- _Plain CSV_: Bitwarden's column layout (logins and notes with custom fields, folder, favourite, authenticator secret). Cards and identities have no column, so they are written as notes with every detail as text, so nothing is dropped. Trash is left out. The CSV is shown only after a strong "NOT encrypted" warning.
- Both ask for the master password again, through the same attempt limiter as unlocking, so someone holding an already unlocked phone cannot guess the password through the export screen.
- The file is written to its own folder in the app-private cache, shared, then deleted. It is also deleted when the export screen opens and when the app starts, in case the app was killed during the share. **Not verified on a device:** Android's share sheet may return before the receiving app has finished reading the file; deleting straight afterwards could then truncate a slow share. If that shows up, the delete should move to the next app start only.
- The export screen blocks screenshots like the other secret screens.

**Import.** Chrome passwords CSV (also its older four-column form), Bitwarden CSV and JSON, KiteVault `.kvault`. Format is detected from the content, not the file name. A password-protected Bitwarden export is refused with an explanation. Files over 20 MB are refused. The picker's cache copy is deleted as soon as it is read; the user's original is never touched or deleted.

- Preview before anything changes: count, new vs. already present, ignored rows. A `.kvault` is opened with its own master password first (wrong guesses count towards the lockout, like the cloud restore).
- **Duplicate** = same type, name, user name, first web address (ignoring `https://`, `www.`, trailing `/`, case) and password. A login with the same name but another password is _not_ a duplicate, so an import can never hide a different password. Entries in the Trash do not count as existing. A repeat inside the file counts as a duplicate of its first copy. "Skip duplicates" is on by default.
- Imported entries always get new ids and are only added: nothing existing is changed or removed. Folders are matched by name (ignoring case) or created. Bitwarden's deleted items arrive in the Trash with their deletion date; Bitwarden creation/revision dates are kept.
- After a plain (unencrypted) import the user gets a "Delete the file now" notice with an "Open file manager" button (opens the Downloads app; Android cannot open a specific file's folder).

**Known limits.** Chrome/Bitwarden do not give an edit time for CSV rows, so imported CSV entries use the import time. Spreadsheet "formula injection" (a cell starting with `=`) is deliberately not escaped in the CSV: escaping would change passwords. Other managers' formats (1Password, LastPass, Firefox, Edge) are not supported.

## One-time codes (2FA / TOTP)

**Libraries.** `otpauth` 9 (RFC 6238 codes; Metro bundles its `esm` build, which uses `@noble/hashes`, an audited library; checked against the RFC vectors in Node) and `expo-camera` (QR scanning only). No custom crypto.

**Storage.** The secret is the entry's `totpSecret` (base32), inside the encrypted vault like every other field: merged, backed up, wiped on lock. New optional `totpParams` (algorithm, digits, period) is stored only when it differs from SHA-1 / 6 digits / 30 s, so a QR code asking for 8 digits or SHA-256 produces the right codes instead of silently wrong ones. Codes are computed on every render and never stored or logged.

**Accepted input.** An `otpauth://totp/...` link (scanned or pasted) or a plain base32 secret (any case, spaces/dashes/padding allowed). Refused with a specific message: counter-based (HOTP) links, non-base32 text, secrets shorter than 16 characters (80 bits, the shortest Google Authenticator issues), algorithms other than SHA-1/256/512, digits outside 6-8, periods outside 10-120 s. A scanned QR code must be an `otpauth://` link, so a website or Wi-Fi QR code is not mistaken for a secret. Secrets already in the vault from an import are kept even if shorter or malformed; such an entry shows "not valid, replace it" instead of a code.

**Camera.** The preview is only shown; the code never calls `takePictureAsync`/`recordAsync` or any file API (a test reads the sources to make sure), so no frame is saved. The `expo-camera` plugin is set to add only `CAMERA` (no microphone, no `RECORD_AUDIO`; checked in the generated manifest). The setup screen blocks screenshots, since the QR code and secret are on screen. The camera permission is requested only when the user taps Scan.

**Display.** Six digits (or the configured number) with a countdown ring of 30 bars that goes out as the period runs out and turns red in the last 5 seconds (drawn with plain views to avoid adding a graphics library). The code refreshes from a one-second clock that exists only while a code is on screen and resyncs when the app returns to the foreground. Tap copies through the same clipboard service as passwords, so the auto-clear delay from Settings applies. Codes appear on the entry detail screen and in the new "Authenticator" filter chip on the vault list (a live code per entry, one shared clock). Trashed entries are not listed.

**CSV.** Exporting writes the bare secret, or a full `otpauth://` link when the settings are non-default; importing reads either, so settings survive a round trip.

**Limits.** The shown time is the phone's clock: a wrong clock gives codes the server rejects. Steam Guard and other non-standard schemes are not supported. Editing an entry in the normal form keeps its 2FA untouched; it is changed on its own screen only.

## Security check

**Local checks (offline, on demand).** Run when the screen opens and again when entries change (for example after fixing one); they use no network. Only live (not Trashed) _logins_ are checked; notes, cards and identities hold no web password.

- _Weak_: zxcvbn-ts score 0 or 1 (the same engine as the new-vault password meter), given the entry's title and user name as "user inputs" so a password built from them rates lower. Each distinct password is rated once. Passwords are cut at 128 characters for rating.
- _Reused_: the same password on two or more logins; each is listed with how many others share it.
- _Old_: the current password is older than 365 days. Age = when it was last changed (newest password-history date), else when the entry was created. For entries imported from a CSV the creation date is the import date (the file has no real date), so those look younger than they are.
- _No password_: a login with an empty password.
- _Could use 2FA_: a login without a code whose web address is on a short built-in list (about 45 well-known sites; subdomains match, look-alike domains do not). Only a hint, can be switched off on the screen, and is **not** counted in the score.
- Big vaults are analysed in chunks of 25 with a pause between them so the screen stays responsive; 2,000 entries were not timed on a phone.

**Score.** 0-100 = 100 × (1 − Σ penalty ÷ logins). Each login is charged for its worst problem only: breached 1.0, weak 0.8, reused 0.6, no password 0.5, old 0.3. Labels: 90+ Excellent, 75+ Good, 50+ Fair, below Poor. It is a rough guide, not a guarantee. Breach results are included only after the breach check has run, and the screen says when it has not.

**Breach check (Have I Been Pwned, k-anonymity).** Off by default (`breachCheckEnabled` in settings.json, off); turning it on only reveals a "Check passwords now" button. Nothing is ever sent when the screen opens, when the switch is turned on, or automatically later. On tap, for each distinct password: SHA-1 on the phone (react-native-quick-crypto; SHA-1 is used only because the HIBP list is indexed by it), then a GET to `https://api.pwnedpasswords.com/range/<first 5 hex characters>` with `Add-Padding: true` (replies are padded so their size reveals nothing). The reply, hundreds of suffixes, is compared locally; padding rows (count 0) are ignored. Passwords sharing a prefix share one request; up to 4 requests run at once, each with a 15 s timeout; a Stop button cancels. **No password, full hash, user name, entry id or account detail is in any request** (tests assert the exact URLs and headers). This is the "optional breach check" CLAUDE.md rule 3 allows, and it needs only the `INTERNET` permission the app already has.

- If any request fails the whole check fails, so a partial answer can never read as "all clear".
- Results are kept in memory only, as SHA-1 hashes of the breached passwords (never the passwords) with a count; they are dropped when the screen closes or the switch is turned off, and the check is not repeated by itself.
- The service is run by Troy Hunt / Cloudflare; its availability and privacy terms are theirs. The count says how often a password appeared in breaches, not that the user's own account was breached.

**Not covered.** Checking that a _site_ was breached (that is a different HIBP API that needs the email address and a paid key), phishing, or whether a password is weak for reasons zxcvbn cannot see.

## Android autofill: FILL flow

Full design and threat model: `docs/AUTOFILL_DESIGN.md` (approved with all recommendations). Manual device checklist: `docs/AUTOFILL_TESTING.md`. What was built, and the classes in simple words: Appendix A and B of the design.

- **Registered by `plugins/withAutofill.js`**: the `AutofillService` (permission `BIND_AUTOFILL_SERVICE`, intent filter, `@xml/kitevault_autofill_service`), the non-exported unlock activity, and a launcher-apps `<queries>` entry (narrow alternative to `QUERY_ALL_PACKAGES`, needed on Android 11+ to read the signing certificate of the app being filled). The Kotlin code stays in the autolinked module `src/native/keystore`; the plugin does not copy it (that would duplicate every class).
- **Fill = locked suggestion, then biometrics.** The service never reads the vault and shows no account or address. After the user taps and passes the fingerprint/face check (`VaultKeyUnlocker`, extracted from `KeystoreModule`, same 5-use / 7-day / restart rules; every autofill counts as one use), `AutofillAuthActivity` reads `vault.kvlt` (or `.bak` mid-save) read-only, decrypts it with platform AES-256-GCM, matches, fills, and zeroes the key and plaintext. One match fills straight away; several are listed; none offers "Search my vault" with a warning.
- **Matching is strict** (`DomainMatcher`, `LoginMatcher`, `RequestOrigin`): a web address is believed only from a trusted browser (21 packages with release certificates generated from Google's privileged-browsers list by `scripts/make-trusted-browsers.js`), only over https, only if every box belongs to one site; any other app is matched by package name plus pinned signing certificate and its claimed web address is ignored (the AutoSpill and fake-page defence). Hosts are compared as punycode; sub-sites match only under a registrable domain from the bundled Public Suffix List (MPL-2.0, notice in the licenses screen). Titles and user names are never used.
- **Never filled:** sign-up forms (`newPassword`), invisible or zero-size boxes, boxes from another site on the same page, http pages (the `scheme` is only reported by Android 9+; older versions are treated as not secure), trashed logins, notes and cards.
- **Data model:** `Entry.appLinks?: { packageName, certSha256 }[]` (read by autofill, kept on edit, no screen to create it yet; data version unchanged).
- **Differences from the plan** (Appendix A): `org.json` instead of a streaming parser; "Search my vault" fills once and does not link (linking needs a vault write, which belongs to the save step); dropdown only (no inline suggestions).
- **Rules checked by tests:** no logging and no network in the Kotlin code, no file writes in the autofill package, `FLAG_SECURE` and overlay-tap filtering on the unlock card, the service only returns a locked suggestion (`autofillSources.test.ts`).
- **Verified:** 74 Kotlin unit tests pass under Gradle (including decrypting a vault file written by the real TypeScript code), the Kotlin module compiles with the service/activity/module, the merged debug and release manifests contain the service and activity with `allowBackup="false"`, and resource linking succeeds. **Not verified (needs a phone):** everything in `docs/AUTOFILL_TESTING.md`, especially which web address and scheme each browser reports, Android 8-9 behaviour, and package visibility of other apps.

## Android autofill: SAVE flow

Design: `docs/AUTOFILL_DESIGN.md` section 8 and Appendix C and D. Device checklist: `docs/AUTOFILL_TESTING.md` section 7.

- **The service never writes the vault.** `onSaveRequest` captures the typed user name and password and the origin (strict rules: trusted browser + https + one site on the page, or an app with its signing certificate), parks them in `kitevault_autofill_pending.bin` and asks Android to open KiteVault. The app reads them after unlock, shows a confirmation screen, and only then writes them into the vault with its normal save.
- **Pending file:** sealed with its own Keystore key `kitevault_autofill_pending_v1` (AES-256-GCM, hardware-backed, `setUnlockedDeviceRequired`, **no biometric**, since the user is not at KiteVault when it is written). At most 3 logins, 10 minutes each, newer replaces older for the same account and place, a damaged file is deleted, writes are temp file + rename. This is the one deliberate place where a password is on disk outside the vault (approved as Q9); it is deleted on save, dismiss, expiry and when the vault is erased.
- **Nothing sensitive in intents:** the intent that opens KiteVault has no extras; the fill flow's intent carries only a random one-time ticket. Tests read the Kotlin source to make sure of this, and that nothing logs.
- **Confirmation screen** (`/autofill-save`, only reachable while unlocked, screenshots blocked): host or "app (package)", user name, password hidden until Show, editable title, folder choice, **Update password** when a live login with the same host (or app link) and user name exists (old password kept in its history, at most 10), "Save as new login", "Already saved", "Not now". A failed save keeps the waiting login.
- **App links** are created here: saving or updating from an app adds `appLinks` (package + certificate) to the entry, which is what makes autofill match that app later. `mergeVaults` now keeps the links of both sides and does not treat differing links as a conflict.
- **Offering to save sign-up forms:** the fill service now answers a sign-up form with a save offer only (no suggestion), but only for trusted origins. Filling still never happens on sign-up forms.
- **Limits:** a waiting login on a rooted phone is readable by code inside the app for up to 10 minutes; strings cannot be wiped; the JavaScript duplicate check is exact-host only; whether Chrome sends save requests to third-party services is unverified.
- **Verified:** Kotlin unit tests (pending store, capture rules, save-form classification, plus the earlier ones) pass under Gradle; Jest covers the native wrapper, matching, new/update actions and history, the review screen, the watcher, erase, and merge of app links. **Not verified:** everything in `docs/AUTOFILL_TESTING.md` section 7 (needs a phone).

## Security review (2026-10-22)

Full report: `docs/SECURITY_REVIEW.md` (findings F-01 to F-24, what was fixed, what is open, what could not be verified, what to hand to an expert). A self-review by the code's author, without a device or a network capture: it does not show that the app is secure.

Fixed in this pass: outside `kitevault://` links no longer steer the app (`+native-intent`); autofill ignores KiteVault's own screens; copied secrets are marked sensitive for Android 13+; saved addresses that disguise the host are never matched; app names are cleaned before they are shown in prompts; the import cache copy and leftover exports are always deleted (also on erase); the unused `VIBRATE` permission is blocked; Google's Data Transport destination list is removed from the build (`plugins/withNoTelemetry.js`) because ML Kit (inside the QR scanner) may send usage data to Google. **That last change is unverified on a device**: check QR scanning and capture the app's network traffic before claiming "no analytics".

Left open on purpose, with reasons and remedies in the report: unauthenticated vault header (needs format v2), screen protection that can fail open, no tap-jacking filter on the main window, local attempt counters that a rooted phone can reset, wall-clock background-lock comparison.

Regression tests: `src/__tests__/securityRegression.test.ts` and `src/native/keystore/__tests__/autofillSources.test.ts`.

## Test suite, coverage and CI (2026-10-22)

- **Unit tests** (Jest, `npm test`) cover crypto, the vault format and store, backup merge, TOTP, the generator, import/export parsers, cloud backup, the security check, and the TypeScript side of autofill. **Kotlin unit tests** (Gradle, 121) cover the autofill rules, the vault reader (against a file written by the real TypeScript code), the pending-save store and the biometric policy.
- **Integration tests** (`src/__tests__/integration/vaultLifecycle.test.ts`): one vault from creation to erase with the real stores, real encryption and file code: create, add an entry, lock, wrong then right password (with the attempt counter), change the master password (data and encrypted body kept, old password refused), more entries, lock/unlock, erase (files, settings, biometric copy, counters gone), and a fresh vault that has no trace of the old one.
- **Coverage** (`npm run test:coverage`, then `node scripts/coverage-report.js`): all of `src` outside the Kotlin code, 93.7 % statements, 89.4 % branches, 90.5 % functions, 94.9 % lines. Limits that fail the run are in `package.json` (`coverageThreshold`): crypto 98/90/100/98 (statements/branches/functions/lines), vault 95/85/95/95, merge 100/95/100/100, TOTP 94/85/94/95, generator 97/95/95/98, import/export 90/85/88/92, global 90/85/88/92. Coverage shows which lines ran, not that the tests would catch a wrong result; it is not a measure of correctness. **Kotlin code has no coverage number** (no JaCoCo set up).
- **Bugs the new tests found:** a Bitwarden card with only a year or only a month got the expiry "00/31"; the app-name cleaner glued words together at line breaks.
- **Not covered by automated tests:** the screens `GeneratorScreen`, `DataTransferCard`, `SecurityCheckCard` (thin wrappers), parts of the backup conflict/history screens and the import/export screens (error paths), and everything that needs a phone; see `docs/MANUAL_TEST_PLAN.md`.
- **CI** (`.github/workflows/ci.yml`): on every push and pull request, read-only permissions, newer pushes cancel older runs. Job `checks`: `npm ci`, format check, type-check, ESLint with no warnings allowed, all Jest tests with coverage and the limits above (two workers, because the Argon2 tests are heavy), a per-area coverage report, the coverage as a downloadable artifact. Job `kotlin-unit-tests`: generates the Android project and runs the Kotlin unit tests. **The workflow could not be run here**: its YAML was only parsed, and every command in `checks` was run locally; the Kotlin job depends on the runner's Android toolchain and may need adjustment the first time it runs on GitHub.
- ESLint now knows Node's globals for the plain Node scripts and config plugins, so `eslint .` passes for the whole repository. The async wait for UI tests is 15 s (it only matters when a test fails) because coverage instrumentation made some screens miss the old 5 s limit.

## Release polish (2026-10-22)

Details and procedures: `docs/RELEASE_POLISH.md`.

- **Logo:** the Kitelux kite with a keyhole where Kitelux has its sparkle (same shape and colours, one clear change), drawn as plain geometry by `scripts/build-brand-assets.js`. Adaptive icon: transparent foreground on a plain `#0E1630` colour, plus a monochrome layer for themed icons. Splash: the logo with its tail on `#0E1630`.
- **Palette:** taken from Kitelux (night blue, amber, orange). Every text pair is held to 4.5 : 1 and control edges to 3 : 1 by `src/theme/__tests__/contrast.test.ts`, light and dark.
- **Touch size:** 48 dp minimum, one shared `TextAction` for text buttons.
- **KDF:** default stays Argon2id 64 MiB, 3 passes, 1 lane. Not changed, because no phone was available to measure; `docs/RELEASE_POLISH.md` gives the measuring steps and a table for tuning. The floor in `kdf.ts` stays.
- **Strength checker** is built on first use, not at start-up.
- **Damaged vault:** never treated as "no vault". The user may erase it (typed confirmation) and restore from Drive; the app does not try to repair it.
- **Backup pending mark** is cleared after a successful upload (and only if no save happened meanwhile), not before it starts.
- **Small JSON files** (settings, attempt counter) are written with a temporary file and rename, like the vault.
- **Privacy text** now describes both optional online features. "No analytics" still needs the network capture before it is claimed in the store listing.

## Erasing the vault asks who you are first (2026-10-22)

- **What:** in Settings, "Erase vault" first asks for the master password (or the phone's fingerprint / face, when biometric unlock is on). Only after that does the existing step appear, where `ERASE` must be typed. Before, typing `ERASE` was enough for anyone holding the unlocked phone.
- **Password check:** `verifyMasterPassword` through `runWithAttemptLimit`, the same path as creating a recovery key, so wrong guesses count against the shared delay. The password is cleared from the field as soon as the check ends and is never stored.
- **Fingerprint / face:** the prompt comes from the native `unlockWithBiometrics`. Passing the phone's own prompt counts as proof; the vault key it returns is wiped at once and not used. **Side effect:** that call counts toward the native "5 biometric unlocks, then ask for the password" counter, the same as a normal biometric unlock.
- **Not asked on the Unlock screen:** the same erase card is shown there (`requireAuth` is off). Someone who forgot the master password must still be able to erase and restore from Drive, so no password is asked there.
- **Not changed:** what gets erased, and the typed `ERASE` step.
- Tests: `src/features/data/__tests__/erase.test.tsx`.

## Biometric unlock opens by itself (2026-10-22)

- Once biometric unlock is set up and ready, the Unlock screen opens the fingerprint / face prompt by itself, so biometrics are the default way in. The master password field and the "Unlock with fingerprint" button stay on the screen.
- **Once per visit:** the prompt is tried one time each time the Unlock screen appears. Dismissing it shows no message and does not bring it back, so the person is never trapped in a loop of prompts; the button can start it again.
- **Only with the app in front:** if the app is not active when the screen appears, it waits until it is, because the system prompt cannot show otherwise.
- Not changed: when biometric unlock stops being usable (restart, 7 days, 5 unlocks, changed fingerprints), the screen behaves as before and asks for the master password. Other failures (for example too many wrong fingers) are still explained.
- Tests: `src/features/biometric/__tests__/unlockBiometricUi.test.tsx`.

## Recovery key page (PDF) redesign (2026-10-22)

- **Layout:** one page, branded header (the kite drawn as inline SVG, "KiteVault", "by Kitelux", a CONFIDENTIAL tag), the key in a 4 x 2 grid of numbered boxes in large monospace, a plain-language note on the characters, three "how to use it" steps, a "keep it safe" checklist, a blank line for "where I keep this page", and a footer saying a new key makes this one stop working. Built in `src/features/recovery/recoveryPdfTemplate.ts`.
- **From looking at others** (1Password Emergency Kit, Proton, Bitwarden emergency sheets, forum threads about typing printed codes): a branded sheet people recognise; the key large and in monospace because O/0 and I/l/1 get confused in other fonts; saying outright that dashes and spaces are not part of the key; storing the paper offline.
- **Left out on purpose:** a QR code (KiteVault has no QR recovery, and a code only gives one more thing to photograph), any account name, email or vault detail, and any field for the master password (the page tells the reader never to write it there).
- **Unchanged rules:** no scripts, nothing loaded from the internet (the logo is inline), and it is printed with `printAsync`, never saved as a file in the app folder.
- **Checked** by rendering the generated HTML to a page-sized image and a PDF on a computer (one page). It has not been printed or saved as a PDF from an Android phone yet, where the system print service may use different fonts and margins.

## Launch animation (2026-10-23)

- **What:** while the app loads, the Kitelux launch animation plays (a kite flies in, the keyhole clicks and flashes with light, "KiteVault" appears, then "from Kitelux"). It lasts about 3.4 seconds and can be skipped with a tap. With the phone's "reduce motion" setting on, it shows the finished picture for about half a second instead. Code: `src/features/splash/KiteVaultSplash.tsx`, shown by `src/app/_layout.tsx` until the app has loaded **and** the animation has ended.
- **New dependencies** (installed with `expo install`, so the versions match this SDK): `react-native-svg` 15.16.0 (the drawing), `react-native-reanimated` 4.7.1 and `react-native-worklets` 0.13.0 (the animation). Reanimated and worklets were already in `node_modules` through another package; they are now listed in `package.json` on purpose, so the native build always includes them. **`react-native-svg` is a native module, so a new development build is needed** (`eas build --profile development --platform android`, or `npx expo run:android`). Reloading the old build will show a "native module not found" error.
- **Safe:** the animation shows no vault data and makes no network calls. The plain native splash is hidden as soon as the animation is on screen. The fonts are optional: without the Sora font the phone's own font is used.
- **Navigation:** nothing navigates while it plays. The layout only moves between screens when the vault goes from unlocked to locked or is erased, and neither can happen before the app has loaded. The first screen is chosen when the navigator mounts afterwards.
- **Tests:** `src/features/splash/__tests__/KiteVaultSplash.test.tsx` uses a small hand-written mock of Reanimated (its own jest mock needs the native runtime), so it checks what is shown and what a tap does, not the motion itself.

## Biometric offer after creating the vault (2026-10-23)

- **What:** right after the master password is created, the home screen shows a popup from the bottom: a fingerprint picture, "Unlock with your fingerprint or face", three short benefits, **Turn on** and **Add later**, and a note that the master password is asked again after a restart, after 7 days or after 5 biometric unlocks. Turning it on shows the system prompt once, then "Biometric unlock is on" with a Done button. A cancelled prompt explains itself and leaves both buttons, so the person can try again or add it later.
- **Why there:** it is the moment the person has just chosen a password and is most likely to say yes, and the home screen is already open behind the popup. Other password managers also offer it at setup (and banking apps use the same "turn on / not now" shape).
- **Add later** closes the popup and changes nothing, so it is not a "never": the existing question after a master-password unlock (with its "Don't ask again") still comes later. That older question is still a plain Android alert, not this popup.
- **Not shown** on a phone without biometrics, or when biometric unlock is already on; the pending offer is then dropped. Nothing about the offer is written to disk.
- **How:** `CreateVaultForm` asks `useBiometricOfferStore` for the offer once the vault exists; `BiometricOfferSheet` on the home screen shows it and uses the existing `enableBiometric`. No change to how biometric keys are stored or checked.
- Tests: `src/features/biometric/__tests__/BiometricOfferSheet.test.tsx` and two in `CreateVaultForm.test.tsx`.

### Update (2026-10-23): one popup everywhere, and "Don't ask again"

- The question after a master-password unlock (it used to be a plain Android alert) now shows the **same popup** as the one after creating the vault. `offerBiometricUnlock` no longer shows anything itself: it checks the same conditions as before (biometrics available, still off, not dismissed) and asks the home screen for the popup.
- The popup now has three choices: **Turn on**, **Add later** (not remembered; it can come back at the next unlock) and **Don't ask again** (remembered in the settings as `biometricPromptDismissed`; the popup is never shown again, from either place, and biometric unlock can still be turned on in Settings).
- Tests: `offerBiometricUnlock.test.ts` and `unlockBiometricUi.test.tsx` now check the request instead of an alert; `BiometricOfferSheet.test.tsx` covers the third button.

## Strong password suggestion on sign-up pages (2026-10-23)

- **What:** on a form with a **new password** box (sign-up or change-password) in a trusted browser, or in an app, the autofill service answers with one locked suggestion, "Suggest strong password (KiteVault)". Tapping it opens a KiteVault sheet, "Use strong password?", which shows a random password and the site or app name. **Use password** fills the new-password box and its "confirm" box; **Generate another** makes a new one; **Create my own** fills nothing. Code: `AutofillSuggestActivity`, `PasswordGenerator`, `PendingSuggestion`, and `suggestionResponse` in `KiteVaultAutofillService`. Google's own "Use strong password?" sheet belongs to Google Password Manager and cannot be used by another provider, so this is KiteVault's own sheet.
- **Same trust rules as filling:** a suggestion is offered only when the origin is known (trusted browser, https, one site only; or an app by its package). Only **visible** boxes explicitly marked as a new password (`newPassword` hint or `autocomplete="new-password"`) are filled. A page that does not mark its boxes gets no suggestion (it still gets the offer to save).
- **No fingerprint is asked.** This differs from filling a saved login. The sheet makes a random password and reads nothing from the vault, so there is nothing to protect, and it therefore works even with biometric unlock off. Saving the password into the vault still needs the master password (or fingerprint) in the app, as for every save. The sheet itself is protected like the unlock screen: not exported, `FLAG_SECURE`, `filterTouchesWhenObscured`, closes when left. A source test checks it never touches the vault.
- **The password:** 20 characters from lower-case, capitals, digits and the symbols `!@#$%^&*-_+=?` (no quotes, backslash, brackets or spaces that web forms often reject), at least one of each kind, shuffled, drawn with `SecureRandom.nextInt(bound)` (every character equally likely). About 120 bits. Kotlin, not the TypeScript generator, because the sheet runs inside the autofill service without the JavaScript side. A source test forbids any other source of randomness in the autofill code. This is Android's own vetted random source, not custom cryptography.
- **Not lost:** when **Use password** is tapped, a note (password, no user name yet, the place) is parked in the same encrypted pending-save file, for the usual ten minutes. If the form is submitted, Android's "Save to KiteVault?" saves the same password with the typed user name, and **replaces the note** (`PendingSaveCodec.replaces`: same place, same password, note has no user name). If it is not submitted, the app offers the note for ten minutes, then it is deleted. Limit: after ten minutes an unsaved suggestion is gone, as with any pending save.
- **Not done:** no setting to turn suggestions off; no choice of length or symbols on the sheet; no suggestion for pages that do not mark their password boxes; Chrome's own "Use strong password?" is unaffected.
- **Checked** by Kotlin unit tests (generator, field detection, the note, the replace rule), source tests (protections, no vault, only `SecureRandom`, one `putExtra`) and plugin tests. **Not checked on a phone yet**; see `docs/MANUAL_TEST_PLAN.md` 14.11 to 14.16. It needs a new development build.

### Update (2026-10-23): sign-up pages that do not mark their password box

- Many sign-up pages do not mark their password box as a new password, so the service cannot tell them from a sign-in page and runs the normal fill flow (fingerprint, then "No saved login"). The first version of the suggestion never appeared there.
- **Fix:** the "No saved login for ..." screen and the "Choose a login" screen of `AutofillAuthActivity` now have a **Suggest a strong password** button. It shows the same "Use strong password?" sheet, fills the password box only (not the user name), keeps the same ten-minute safety note, and leaves the save-after-submit to Android's own "Save to KiteVault?". It is offered only when the origin is known (the same rule as the rest), and it comes after the fingerprint check that the fill flow already did.
- **Not changed:** the service still does not guess from words like "signup" or from the number of password boxes, so on such a page the person still reaches the button after the fingerprint step. If a login is already saved for the site, it is filled automatically as before (and a sign-up on that site gets the old password); the person can cancel and use Search or the suggestion only when no login matches or several match.
- Source test: `autofillSources.test.ts`.

## New look for the screens shown over other apps (2026-10-23)

- **What:** the sheet that appears on top of another app (after "Unlock KiteVault to fill", the choice of login, "No saved login", the search, the warning, the "Use strong password?" sheet) and the suggestion row in the autofill list were plain white Android views. They now use KiteVault's own look: a night-blue sheet with rounded top corners that slides up, the kite and the name, a small pill that says which site or app it is for (green lock for a web address a trusted browser reported over https, amber for an app, whose name is only a label), big amber buttons, a coloured letter for each login (the same colour as in the app's list), the generated password in a dark box with digits in amber and symbols in coral, a spinner while unlocking, and warning screens with an icon. Tapping the dimmed area above the sheet closes it without filling anything.
- **How:** `SheetUi` builds the views in code (nothing to inflate), `AutofillStyle` holds the colours and the small rules (unit tested, including contrast: every text colour is held to 4.5 : 1 on what it is drawn on, like the app's own contrast tests). `AutofillAuthActivity` and `AutofillSuggestActivity` keep all the logic and every security setting (`FLAG_SECURE`, `filterTouchesWhenObscured`, not exported, closes when left, the one-time ticket, the strict matching, wiping the key). A source test checks that `SheetUi` has no vault, file, intent or network code and that the two screens no longer build their own views.
- **The autofill list row** (`kitevault_autofill_locked_item.xml`, `kitevault_autofill_suggest_item.xml`): the kite icon, a bold first line and a smaller second line. The text is fixed and still never contains a web address, an account or page text. Colours are left to the system so it reads in the light and the dark drop-down.
- **Safer default on the "fill anyway" screen:** the safe choice (Cancel) is now the big amber button and "Fill anyway" is the red-orange one below it.
- **Not done:** no light version of the sheet (it is always night blue), no keyboard-strip (inline) version of the suggestion, no animation between the fingerprint dialog and the sheet (the dialog is the system's). Not checked on a phone yet; see `docs/MANUAL_TEST_PLAN.md` 14.17.

## Password autofill: research, what was built, what was left out (2026-10-23)

**Research** (how other managers and Google do it; used to decide what is a real need):

- Android's framework lets a service answer a form with datasets or with an authentication step, and a dataset can wait behind its own authentication with no value yet ([FillResponse.java](https://raw.githubusercontent.com/aosp-mirror/platform_frameworks_base/master/core/java/android/service/autofill/FillResponse.java), [Dataset.java](https://raw.githubusercontent.com/aosp-mirror/platform_frameworks_base/master/core/java/android/service/autofill/Dataset.java)). Nothing in the source stops a response from carrying both, but it is not documented what the system then shows, so the sign-in answer was kept as it is (it works on a phone).
- Chrome 131 and later fill natively through a third-party service when "Autofill using another service" is on ([Android Developers Blog](https://android-developers.googleblog.com/2024/10/chrome-3p-autofill-services.html)). Google's own "Use strong password?" sheet is part of Google Password Manager; another provider cannot show it.
- Bitwarden's Android autofill offers inline or pop-up suggestions and does **not** support sign-ins split over two pages ([Bitwarden help](https://bitwarden.com/help/auto-fill-android/)). A 1Password community answer says suggested-password prompts like the browser's are not possible on Android. So a strong-password suggestion from an autofill service is unusual, not standard.
- The open-source Android Password Store treats an explicit `new-password` hint as the signal for "only generate a password", and decided **not** to treat unmarked password boxes as certain ([commit](https://code.nicolabs.net/nicolabs/Android-Password-Store/commit/eaaa3eeea8d437abec9a70135080c2f5e03b205d)). Android's sample warns that sign-ins over two screens trigger two save prompts ([sample](https://android.googlesource.com/platform/developers/samples/android/+/5367691%5E%21/)).

**Decided and built** (each answers "is it a real need, and is this the best way?"):

| Case                                                                                     | Decision                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-up page that marks `new-password`                                                   | Built earlier: suggestion with no fingerprint.                                                                                                                                                                                                                              |
| Sign-up page that does **not** mark its boxes but has two or more visible password boxes | **Built.** A cautious guess (see below), so the suggestion appears with no fingerprint. A single box is never guessed, because turning a sign-in into a sign-up is the worst mistake.                                                                                       |
| Unmarked sign-up with one box                                                            | Looks like a sign-in. After the fingerprint the "No saved login" screen offers the strong password. **New:** if the fingerprint is cancelled, or biometric unlock is off, a sheet still offers it (no dead end).                                                            |
| Change-password page                                                                     | **Built.** Tapping the old box fills it (never a strong password there); tapping a new box suggests, and fills the confirm box too.                                                                                                                                         |
| Saving a changed password when the page has no user-name box                             | **Built in the app.** The login(s) for that site are the candidates: one is offered for updating, several make the person choose, and the old password goes to the history as before. Nothing is assumed when there are several.                                            |
| Sign-in over two pages                                                                   | **Built** for the page with only a user name, when the box is explicitly marked as a user name (not an ordinary e-mail box, which would show on every newsletter form). The password page already worked. Only user name is filled; logins without a user name are skipped. |
| Length and symbols                                                                       | **Built.** 12, 16, 20 or 32, and symbols on or off, remembered (a number and a yes/no; no site, account or password is ever kept). Many sites cap the length or refuse symbols.                                                                                             |
| Browsers                                                                                 | Already covered: Chrome, Firefox, Edge, Brave, Vivaldi, Samsung Internet, DuckDuckGo, Opera, Vanadium.                                                                                                                                                                      |

**How the guess works for unmarked boxes** (`FieldClassifier.rolesOf`): a box the page marks is believed. Otherwise, with two or more visible password boxes: a box named like "current", "old" or "existing" holds the old password and the others are new; if nothing is named, two boxes are a sign-up with a confirm box and three or more are a change-password (the first is the old one). A single box named like "new password" or "create a password" is new; any other single box is a sign-in. Hidden boxes never count. The box names come from the page's own id, name, placeholder or label, are used only in memory and are never shown, saved or logged. **If the guess is wrong on a sign-in page with two password-type boxes, the person sees the suggestion instead of the saved login** (and a save is never made if the two boxes disagree). That is the known cost of the guess.

**Left out on purpose** (each recorded so it is not forgotten):

- Keyboard-strip (inline) suggestions: the drop-down works, and inline needs an extra library and keyboard support that varies; a nice-to-have, not a need.
- Filling 2FA codes: valuable, but it is not about the password, and it needs TOTP computed natively from the vault. Best next feature.
- Passkeys, cards and addresses: other features.
- In-app browsers: refused on purpose, because the real address cannot be trusted there.
- A setting to turn suggestions off: switching the Android autofill service back to Google does the same; not needed yet.
- A second "Suggest strong password" row on every sign-in page: it would clutter every sign-in, and the cancel-the-fingerprint sheet covers the single-box sign-up.

**Tested:** 188 Kotlin unit tests (the guess, the pages above as whole scenarios, the generator and its options, origin rules, the saved notes) and the JavaScript tests (the save screen for each change-password case, the Autofill status screen). Source checks keep the rules (no logging, no network, no vault in the strong-password code, only `SecureRandom`). **Not tested on a phone or an emulator** (this computer has neither): the real behavior of Chrome and other browsers on real sites, and how every screen looks. See `docs/MANUAL_TEST_PLAN.md` 14.11 to 14.24.

### Update (2026-10-23): a smaller sheet over other apps

- The sheet shown over other apps (and the rows in the autofill list) is smaller: title 18 sp (was 22), body 13.5 sp (was 15), buttons 46 dp high with 15 sp text (were 52 and 16), login rows 52 dp (were 64) with a 36 dp avatar (was 44), the password in 16 sp (was 20), options 40 dp high (were 44), tighter spacing, side padding 16 dp (was 20), corners 22 dp (was 28). In the autofill list the row is 48 dp high with a 16 x 22 dp kite, 14 sp and 12 sp text.
- **Why compact:** it appears on top of somebody else's app, so it should take as little of that screen as it can. **Limits that stay:** nothing you tap is below 44 dp (buttons), 48 dp (rows) or 40 dp (option chips), and no text is below 12 sp. Every size lives in `SheetMetrics`, and `SheetMetricsTest` fails if a change breaks these limits. A source test checks that `SheetUi` has no plain sizes of its own.
- Not seen on a phone: if it now looks too small or too tight, change the numbers in `SheetMetrics` (and the two layout files); the tests say how far it can go.

### Fix (2026-10-23): fill at once, no second tap

- **Bug:** after "Use password" (and after the fingerprint for a saved login) Chrome showed the answer as another list item ("Unlock KiteVault to fill" again) and the person had to tap it a second time. Cause: the suggestion was an authentication for the **whole answer**, so the unlock screen had to hand back a whole answer, and Android shows the datasets of a returned answer instead of filling them. The earlier comment "it is filled in straight away" was wrong.
- **Fix:** the suggestion is now a **dataset that carries its own unlock step** (`Dataset.Builder(presentation)`, every box set to `null`, `setAuthentication(sender)`). The unlock and strong-password screens hand back a **dataset** (`Dataset.Builder()` with the real values), which Android fills into the boxes immediately. The "Save to KiteVault?" question stays in the first answer (`setSaveInfo`), so saving is not affected. Android's source shows datasets can wait behind their own authentication with empty values.
- **Unchanged rules:** the service still never builds a value (a source test forbids `AutofillValue` in it and requires every box to be `null`), the same ticket, origin and matching rules, and the screens still hand back only the boxes that were found.
- **Tested:** the source checks (a dataset, not a whole answer; no value in the service) and the Kotlin build. **Not tested on a phone**, which is the only place that proves it fills at once: `docs/MANUAL_TEST_PLAN.md` 14.25.

## Cloud backup switched on in app.json (2026-10-23)

- **Why it said "not available in this version of the app":** the Google Drive backup ships off. `app.json` had `"enabled": false` (in the `withGoogleBackup` plugin options and in `extra.cloudBackup`), and with that the backup card, the sign-in and the network code are all off by design (`isCloudBackupAvailable()` is false). The message is the app's way of saying the switch is off.
- **Done:** both values are now `true`. This is only the app's switch. **It does not set up Google.** Until the Google Cloud steps in `docs/GOOGLE_SETUP.md` are done and the build's signing key is registered, sign-in fails with "not set up correctly for this build" (that is the `setup-error` message, Google's DEVELOPER_ERROR).
- **For a local debug build** (`npx expo run:android`) the signing key is the debug keystore on this computer: SHA-1 `D3:EC:5B:38:E0:47:10:C9:30:C7:81:CC:98:C1:BE:0C:20:60:B0:BF`. An EAS build uses its own key (`eas credentials`), and a Play Store install uses the Play app signing key; each needs its own Android OAuth client with package name `com.kitelux.kitevault`.
- No code changed; the plugin tests (which do not fix the shipped value) pass.

### Update (2026-10-23): cloud backup works on a development build

- Google Cloud project `KiteVault`: Drive API enabled, consent screen in **Testing** mode with the owner's Gmail as a test user, only the `drive.appdata` scope (plus the basic sign-in identity), two Android OAuth clients for package `com.kitelux.kitevault`: the local debug key (SHA-1 `D3:EC:5B:38:E0:47:10:C9:30:C7:81:CC:98:C1:BE:0C:20:60:B0:BF`) and the EAS **development** key (SHA-1 `42:20:C7:D0:96:23:77:C2:FF:68:C4:5E:7F:BF:37:EE:92:11:31:A0`). These are certificate fingerprints, not secrets.
- **Found by the owner on a phone:** sign-in and "Turn on cloud backup" work on the EAS development build. The first sign-in attempt failed with "not set up correctly for this build" because only the debug key was registered; it worked after the EAS key was added and a few minutes had passed.
- **Still to do before a public release** (see `docs/GOOGLE_SETUP.md`): add the EAS **production** key and the Play **app signing** key as further clients; move the consent screen out of Testing (testers are signed out after about 7 days); a privacy policy link is needed to publish. Not yet checked on a phone: a restore on a second phone or after "Erase vault".

## Moving cloud backup to production (2026-10-23)

- **Pages (live, checked):** home page https://kitelux.com/vault/, privacy policy https://kitelux.com/vault/privacy/, terms https://kitelux.com/vault/terms/. The policy already covers the optional Drive backup, the `drive.appdata` permission, Google's Limited Use rule, no analytics, and deletion.
- **Two gaps to fix on the site before publishing** (Google's reviewers read these): (1) the policy does not say what is done with the Google account **email**. The app shows it on the backup screen as "Signed in as ...", keeps it only in memory, never saves it and sends it nowhere except in Google's own sign-in. (2) The home page says "No accounts" and never mentions the optional Google sign-in for backup; add a short note about the optional Drive backup (what it can and cannot see, how to turn it off or delete it).
- **Google Cloud, in this order:** Branding: add the three links and the authorised domain `kitelux.com` (Google may ask to verify it in Search Console with a DNS record, using the account that owns the project). Audience: **Publish app**. Verification centre: read what, if anything, it asks for (only `drive.appdata` plus the basic identity is normally non-sensitive). Clients: add the EAS **production** key and the Play **app signing** key (Play Console > App integrity) as further Android clients. Until the Play key is added, installs from Google Play cannot sign in.
- **Not done by me:** anything in Google Cloud, Search Console, Play Console or EAS (they need the owner's accounts); the public site edits; the Play listing and Data safety form (answers follow `docs/DECISIONS.md`, "Cloud backup").
- **Before real users:** the "Do not release" list in `docs/MANUAL_TEST_PLAN.md`, and the reviews `docs/SECURITY_REVIEW.md` section 8 says to do before anyone else's passwords go in (cryptography review, network capture, Android penetration test). The autofill features added later have only been tested by unit tests, not on phones.
