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
- **Deviation from the brief:** changing the master password also generates a **new vault key** and re-encrypts the body. The body is a single blob, so this costs nothing extra, and it means someone who knew the old password and kept an old copy of the file cannot use the old wrapped key to read the new file. (The old copy itself stays readable with the old password; nothing can change that.)

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
  "wrappedKey": "<base64, 60 bytes = iv 12 | vault key 32 | tag 16>"
}
```

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

- Changing the master password creates a **new vault key**, so the stored one becomes stale. The store turns biometric unlock off after a successful change; the user can turn it on again. If a stale key is ever used anyway, the vault refuses it (`WRONG_KEY`), the stored key is removed, and the user is told.
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
