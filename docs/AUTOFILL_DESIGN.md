# KiteVault Android autofill: design

Status: **approved on 2026-10-22 with all recommendations (Q1 to Q9 as recommended in section 0 and 13).** No code written yet. Implementation follows the order in section 15, one step at a time.

This document answers: how KiteVault can fill and save logins in Chrome and other apps without weakening the rules in `CLAUDE.md`, and what could go wrong.

---

## 0. Decisions I need from you (read this first)

Each of these changes what gets built. My recommendation is first.

| #   | Question                                                                                                                                                                                                                                                                                           | Recommendation                                                                                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | **Digital Asset Links (DAL) need the network.** An autofill service cannot check "does `bank.com` really vouch for this app" offline: it means downloading `https://bank.com/.well-known/assetlinks.json`. `CLAUDE.md` rule 3 allows network calls only for the Drive backup and the breach check. | **Do not use DAL in v1.** Apps are linked to entries only by an explicit user confirmation, pinned to the app's signing certificate (section 6.3). DAL can be a later, separately approved, optional feature (section 6.6). If you want DAL in v1, rule 3 must be amended by you first. |
| Q2  | **Autofill needs biometric unlock to be turned on.** The service cannot ask for the master password (Argon2id is not available in Kotlin; section 4.5). It also shares the existing limits: 5 biometric unlocks, 7 days, and a restart, after which the master password is needed in the app.      | **Yes: require biometric unlock, and count every autofill as one biometric unlock.** It is the simplest and safest rule. The 5-unlock limit will be reached quickly by someone who fills often; see the trade-off in 4.4.                                                               |
| Q3  | **Credential Manager (`CredentialProviderService`, Android 14+).**                                                                                                                                                                                                                                 | **Build the `AutofillService` first (Android 8+, covers Chrome and apps), and the Credential Provider as a second step** that reuses the same Kotlin core. Passkeys are out of scope.                                                                                                   |
| Q4  | **Matching apps.** Exact package name only is spoofable by a sideloaded clone.                                                                                                                                                                                                                     | **Exact package name plus the app's signing-certificate SHA-256, pinned the first time the user links the app to an entry (trust on first use).** Never fuzzy matching.                                                                                                                 |
| Q5  | **A fill request from a place that matches nothing** (a random app, an unknown browser, a different domain).                                                                                                                                                                                       | Offer only a **"Search my vault"** item. The user picks an entry by hand after a full-screen warning that shows the real domain or app. Never auto-suggested. Say if you would rather forbid this completely.                                                                           |
| Q6  | **Where the Kotlin code lives.** The existing biometric classes are `internal` to the Gradle module `src/native/keystore`.                                                                                                                                                                         | **Same module**, new sub-package `...kitevaultkeystore.autofill`, and a second Expo module class `KitevaultAutofill` declared in the same `expo-module.config.json`. The folder keeps its name.                                                                                         |
| Q7  | **Public Suffix List** (needed to know that `github.io` and `blogspot.com` are not "one site"). It is MPL-2.0 and about 200 KB.                                                                                                                                                                    | **Bundle a copy** in the app (no network), add its notice to the licenses screen.                                                                                                                                                                                                       |
| Q8  | **Browsers.**                                                                                                                                                                                                                                                                                      | Trust the domain a browser reports only for an **allow-list of known browsers, identified by package name and signing certificate** (section 6.2). Chrome needs version 135 or newer with a setting turned on (section 1).                                                              |

---

## 1. What I read, and what I could not confirm

Sources used (all current as fetched on 2026-10-22):

- [Build autofill services](https://developer.android.com/identity/autofill/autofill-services)
- [Optimize your app for autofill](https://developer.android.com/identity/autofill/autofill-optimize)
- [Credential provider guide](https://developer.android.com/identity/sign-in/credential-provider)
- [Associate apps and sites (Digital Asset Links, `get_login_creds`)](https://developers.google.com/identity/smartlock-passwords/android/associate-apps-and-sites)
- [Chrome on Android and third-party autofill services](https://android-developers.googleblog.com/2024/10/chrome-3p-autofill-services.html)
- [Expo: config plugins for libraries](https://docs.expo.dev/config-plugins/development-for-libraries/), [Expo Modules API](https://docs.expo.dev/modules/module-api/)
- Research on password-manager phishing by package name and WebView leaks: [AutoSpill (BleepingComputer)](https://www.bleepingcomputer.com/news/security/autospill-attack-steals-credentials-from-android-password-managers/amp/), [Sophos on phishing apps](https://news.sophos.com/en-us/2018/09/28/mobile-password-managers-vulnerable-to-phishing-apps/)

**Confirmed from those pages**

- An `AutofillService` is declared with `android:permission="android.permission.BIND_AUTOFILL_SERVICE"` and an intent filter for `android.service.autofill.AutofillService`; the user turns it on in system settings, and an app can send them there with `Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE`.
- `onFillRequest` receives an `AssistStructure`; the answer is a `FillResponse` with `Dataset`s. Keep responses small: **at most 20 datasets**.
- **Authentication before fill** is built in: `FillResponse.Builder.setAuthentication(ids, IntentSender, presentation)` (or per dataset). The service shows a locked placeholder; the system launches our activity; the activity returns the real `FillResponse`/`Dataset` in the `EXTRA_AUTHENTICATION_RESULT` extra. This is the hook for the biometric prompt.
- Saving: `SaveInfo` tells the system what to offer to save; `onSaveRequest` runs afterwards. `SaveCallback.onSuccess(IntentSender)` (API 28+) lets the service start an activity afterwards, launched in the context of the app that was being filled.
- Android's own advice: encrypt stored data, use data only for suggestions, and only expose the data a request needs.
- **Chrome**: it dropped autofill "compatibility mode" (the accessibility-based hack). Chrome supports third-party autofill services natively from **version 135**, and the user must set the service as the system default **and** choose "Autofill using another service" in Chrome's settings. The service needs nothing extra if it integrates properly with the normal autofill framework.
- **Credential Manager providers** run on **Android 14+**. The manifest uses `BIND_CREDENTIAL_PROVIDER_SERVICE`; entries need a `PendingIntent`; a locked provider returns an `AuthenticationAction`; the provider receives `CallingAppInfo` with the calling package and its signing info; saving uses `onBeginCreateCredentialRequest` and `CreateEntry`. A credential provider in the same package as an autofill service is shown together with it.
- Digital Asset Links: a site publishes `/.well-known/assetlinks.json` with the relation `delegate_permission/common.get_login_creds`; the app declares the association with an `asset_statements` meta-data entry. Verifying it means fetching that file (or calling Google's API, which needs an API key).

**Not confirmed (the Android reference pages were too large to read in full). Each is marked "verify" where it matters and has to be checked on a real phone or in the reference before relying on it:**

- The exact guarantees about `ViewNode.getWebDomain()` / `getWebScheme()` / `getHtmlInfo()`, and which Android versions have them. I am designing as if **a web domain reported by a non-browser app is not trustworthy**, because an app controls its own views.
- Which flags the authentication `PendingIntent` needs (`FLAG_MUTABLE` is likely required on Android 12+ so the system can add its extras).
- Whether **Chrome sends save requests** to third-party services at all. Fill is the priority; save in Chrome may only work in apps.
- The signing-certificate fingerprints of the browsers in the allow-list. I will read them from official sources at implementation time rather than type them from memory.
- The current stable version of `androidx.credentials` (the guide shows `1.7.0-alpha03`).

**Expo.** A local Expo module is a normal Android library. Its `AndroidManifest.xml` is merged into the app, so the service, the activity and `<queries>` can be declared there and **no config plugin is needed** for autofill. The Expo docs say plugins are for changes that cannot live in the module itself. If a manifest merge turns out not to work on device, a small `withAndroidManifest` plugin is the fallback (not planned). I could not find Expo documentation that describes declaring a service in a module manifest, so this is checked by building and by inspecting the merged manifest (the same way `allowBackup` was verified).

---

## 2. Goals and non-goals

**Goals**

1. Offer to fill a saved login in Chrome (135+) and other browsers and apps, after a biometric check.
2. Offer to save a new login to KiteVault after the user typed it somewhere.
3. Match only when the identity of the page or app is certain enough; otherwise do nothing.
4. Keep every rule in `CLAUDE.md`: no custom cryptography, no logging of secrets, no network calls, decrypted data short-lived, `allowBackup` stays `false`.

**Non-goals for v1**

- Passkeys, cards, identities, one-time codes (TOTP) and notes. Only `login` entries are filled.
- Inline suggestions on the keyboard (Android 11+). Only the dropdown. Inline needs extra presentations and shows account names before unlock; it can come later.
- Filling with the master password. Biometrics only (section 4.5).
- Any network call (section 6.6).

---

## 3. Architecture

```
 Browser / app            Android system                KiteVault (one app process)
 -------------            --------------                ---------------------------
 login screen  --------> autofill framework --------->  KiteVaultAutofillService
                                                          * parse screen   (fast, no secrets)
                                                          * decide origin  (browser+domain / app+cert)
                                                          * answer with a LOCKED placeholder
                                                              FillResponse.setAuthentication(...)
 user taps "KiteVault"
                      framework launches ------------->  AutofillAuthActivity (translucent, FLAG_SECURE)
                                                          * BiometricPrompt  (Keystore key, same as Step 7)
                                                          * decrypt vault.kvlt  (AES-256-GCM)
                                                          * match entries      (strict rules, section 6)
                                                          * choose one         (small chooser if several)
                                                          * return Dataset ----> framework fills the fields
 user submits a new login
                      onSaveRequest ------------------>  KiteVaultAutofillService
                                                          * keep ONE pending save, encrypted at rest
                                                          * start KiteVault to review it (API 28+)
                                                        React Native app: "Save this login?" screen
                                                          * unlocked vault -> creates/updates the entry
```

Key points:

- **The service never has a key and never decrypts.** It answers every fill request with a locked placeholder in milliseconds. All decryption happens in the authentication activity, after the biometric check.
- **The service never writes `vault.kvlt`.** The React Native side keeps the whole vault in memory and rewrites the file on every save; a second writer would lose updates. Saves go through a pending-save queue handled by the app.
- All Kotlin runs in the same process and user ID as the app, so it can use the same private storage and the same Keystore key (the alias `kitevault_biometric_key_v1` was reserved for this in Step 7).

---

## 4. How the vault key is obtained

### 4.1 What exists today (Step 7)

- The 32-byte **vault key** is encrypted with a Keystore AES-256-GCM key (`kitevault_biometric_key_v1`) that needs a **Class 3 biometric check for every single use** (`setUserAuthenticationRequired(true)`, timeout 0, `AUTH_BIOMETRIC_STRONG`), is invalidated when a new fingerprint/face is enrolled, and needs an unlocked device.
- The encrypted copy is `kitevault_biometric_blob.bin` in the app's private folder (`WrappedKeyStore`).
- `BiometricPolicy` forces the master password again after a reboot, 7 days, or 5 biometric unlocks since the last password.

### 4.2 What autofill does

The authentication activity repeats exactly what `KeystoreModule.unlock` does, in the same order:

1. `WrappedKeyStore.hasBlob()` and `KeystoreKeys.exists()`, otherwise "biometric unlock is off".
2. `BiometricPolicy.reauthReason(...)`. If it returns a reason, **stop**: show "Open KiteVault and unlock with your master password first" and return nothing.
3. Check `BiometricManager.canAuthenticate(BIOMETRIC_STRONG)`.
4. Build the decrypt `Cipher` with `KeystoreKeys.decryptCipher(key, blob.iv)`. Failures such as `KeyPermanentlyInvalidatedException` end the flow with a message (the main app shows the full explanation and cleans up the next time it opens).
5. `BiometricPrompter.authenticate(...)` with the cipher as the `CryptoObject`. Only after the user passes can the hardware run the cipher once.
6. `cipher.doFinal(blob.ciphertext)` gives the vault key. `WrappedKeyStore.countBiometricUnlock()` is called **before** the key is used (same as today).
7. The key is used to decrypt the vault (section 5) and then **zeroed** (`Arrays.fill`) in a `finally` block.

The prompt text names what is about to happen: "Fill **example.com**" or "Fill **<app name>**" (the verified origin, not text from the page).

### 4.3 Refactor this requires

The unlock steps live inside `KeystoreModule` and use the React activity. To share them without copying, I will extract them into one internal class `VaultKeyUnlocker` that takes an activity and returns the key bytes, and make `KeystoreModule.unlock` call it. This is a behaviour-preserving change to code that works today, so it carries a regression risk for biometric unlock; it will be re-tested by hand on a phone. The alternative (copying about 60 lines) would let the two copies drift apart, which is worse for a security path.

### 4.4 The cost of counting autofills

Every autofill is a biometric unlock, so after 5 fills the user must type the master password in the app. People who fill many logins a day will hit that within the day. Options, in order of safety:

1. **Count them (recommended).** Simple, consistent, safest.
2. A higher limit for autofill only. Weaker, needs a decision on a number.
3. Keep the vault key in memory while the app itself is unlocked and let autofill use it without a prompt. Convenient, but it puts the key in a second place in memory and makes autofill work with no check at all while the app is unlocked. Not recommended for v1.

### 4.5 Why no master-password path

The master password becomes a key with Argon2id (64 MiB, 3 passes by default). Kotlin has no Argon2 in the platform; I would need a library (for example Bouncy Castle) and it would run in the autofill process on low-memory phones, in front of another app. It is also a second implementation of the key derivation that must stay identical to the JavaScript one. For v1: **if biometric unlock is not on, or the policy asks for the password, autofill shows "Open KiteVault to unlock" and fills nothing.** The Settings card says clearly that autofill needs biometric unlock.

---

## 5. Decrypting the vault file in Kotlin

### 5.1 File format (Step 4, unchanged)

```
0   4   magic "KVLT"
4   2   header length N (unsigned 16-bit big endian, 1..4096)
6   N   header: UTF-8 JSON  { formatVersion, kdf, salt, wrappedKey, recovery? }
6+N rest body: AES-256-GCM  iv(12) | ciphertext | tag(16)    key = the vault key
```

The body decrypts to the vault JSON: `{ version, entries[], folders[], settings }`.

### 5.2 Steps in `VaultReader`

1. **Read** `vault.kvlt` from the app's private files folder (`context.filesDir`), the same place the JavaScript side writes to (Expo's document directory; checked when implementing). If it is missing or fails the structure check (magic, length range, header JSON parses, `formatVersion == 1`), read `vault.kvlt.bak` instead. This matches the crash-safe save sequence (section "Saving and crash safety" in `DECISIONS.md`): at any instant one of the two is complete. The reader **never writes, renames or deletes** anything. If both fail, retry once after 150 ms (a save may be in the middle of its swap), then give up.
2. **Check** the file size (cap 64 MB) and header range exactly like `isWellFormedVaultFile`. Unknown `formatVersion` or data `version` means **refuse** ("update KiteVault"), never guess.
3. **Decrypt** the body with `javax.crypto.Cipher` `AES/GCM/NoPadding` (the platform provider; **no custom cryptography**), 128-bit tag, IV = first 12 bytes. A GCM failure means "wrong key or damaged file": tell the user to open the app; do not retry.
4. **Parse as a stream** with `android.util.JsonReader` over the decrypted bytes. For each entry read only `id`, `type`, `title`, `username`, `password`, `urls`, `appLinks`, `deletedAt`, and **skip every other value** (notes, custom fields, card details, history, TOTP secrets). Entries that are not `login` or that have `deletedAt` are dropped immediately. Unknown fields are skipped, so newer files stay readable.
5. **Match** (section 6) while reading, keep at most 20 candidates, and copy out only the fields the response needs.
6. **Wipe**: the decrypted byte array, the key and the cipher input are overwritten with zeros in `finally`. The JVM `String`s created from JSON cannot be zeroed; this is the same limit already documented for JavaScript in `DECISIONS.md`. They are released as soon as the activity finishes, which is short-lived by design (one fill).

The fixture test (section 12) decrypts a file produced by the real TypeScript code, so a format drift is caught by a test, not by a user.

---

## 6. Matching

The rule: **fill only when I know exactly which site or app is asking, and it is the one the entry is for.** Title similarity, substring matches, "contains the brand name" and package prefixes are never used.

### 6.1 Deciding who is asking (`RequestOrigin`)

The service looks at the `AssistStructure`:

| Situation                                                                                                  | Origin used                                                                       |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| The package that owns the window is a **trusted browser** (6.2) and the focused field reports a web domain | **Web origin:** scheme + host, taken from the field's reported web domain         |
| Any other package                                                                                          | **App origin:** package name + signing-certificate SHA-256                        |
| A non-browser package whose fields report a web domain (a WebView inside an app)                           | **App origin only.** The reported domain is ignored (see AutoSpill in section 11) |

For a web origin:

- The scheme must be `https`. **No fill on `http`** (it can be changed in transit); the locked item then offers only "Search my vault" with a warning. Verify: `getWebScheme()` availability is API 28+; below that the scheme is treated as unknown and also refused.
- **Every** fillable field must report the same domain as the focused one. A page that mixes domains (a login form in a cross-origin `<iframe>`, a hidden form from another site) gets nothing.

### 6.2 Trusted browsers

A small allow-list in code (`TrustedBrowsers.kt`): **package name plus the SHA-256 of the signing certificate**, checked with `PackageManager` at request time. Candidates: Chrome (stable/beta), Firefox, Brave, Edge, Samsung Internet, Vivaldi, Opera, DuckDuckGo. The certificate fingerprints are copied from official sources when implementing (not from memory), and each browser is tested on a device before it goes in the list. A browser that is not listed is just an app: its web fields are not matched by domain. Adding a browser is a code change, on purpose.

### 6.3 Matching apps (`AppLinks`)

Entries get a new optional field `appLinks: [{ packageName, certSha256, label }]`.

- A fill request from an app matches an entry **only if** the entry has a link with the **same package name and the same certificate**.
- Certificates come from `PackageManager` (`GET_SIGNING_CERTIFICATES`, `signingInfo`, API 28+; on API 26/27 the single `GET_SIGNATURES` certificate). If the developer rotated their key with proof of rotation, the pinned certificate may be in the app's `signingCertificateHistory`; that is accepted. An app with several signers must match as a set.
- **Linking is always the user's act.** When an app asks and nothing matches, the locked item says "Search my vault". The user picks an entry and sees: the app's real name and package, and "Link this app to _<entry>_? Only do this if you trust this app." Confirming stores `{ packageName, certSha256, label }` in that entry. This is trust on first use: it protects against a later clone with the same package name but a different key; it cannot protect against linking a malicious app by mistake.
- Links are shown in the entry's edit screen with a **Remove** button. They are not typed by hand.
- Entries imported from Bitwarden may contain `androidapp://com.example` in their web addresses. Those are **never used for matching** until the user links the app (which adds the certificate).

### 6.4 Matching websites (`DomainMatcher`)

For each login, each address in `urls` is reduced to a host:

1. Take the host only (no scheme, port, path, user info); lower-case it; convert to ASCII with `java.net.IDN.toASCII`, so look-alike Unicode letters become `xn--...` and can never equal the real name.
2. Drop a single leading `www.`.
3. **Exact host match** with the request host: a match.
4. **Subdomain match:** the request host is a subdomain of the entry host **only if the entry host is a registrable domain** according to the bundled Public Suffix List (for example `example.com`, `example.co.uk`). An entry for `github.io` or `blogspot.com` (a public suffix) matches only itself, so one customer's page can never receive another's login.
5. Everything else is no match: `bank.com.evil.test`, `bank-com.test`, `evilbank.com`, `bank.com.` with tricks, IP addresses against names.

The reverse (request is `bank.com`, entry is `login.bank.com`) does **not** match.

### 6.5 What happens with no match

The response still shows the locked "KiteVault" item (Android cannot show it only when there is a match without decrypting first; storing a plaintext index of the user's sites on disk would leak which sites they use, so I do not). After the biometric check the user sees either their matching entries or "No saved login for _example.com_" with **Search my vault** (Q5).

If the user chooses an entry that does not match the origin, a full-screen warning shows the real origin and the entry's address in large type, requires an extra tap, and **never links or learns anything**.

### 6.6 Digital Asset Links, deferred (Q1)

DAL would let KiteVault learn "this app is officially the app of `bank.com`" with no manual link. It needs a network request to the site (`/.well-known/assetlinks.json`) and checks the app certificate against it. If approved later, it should be: opt-in, run **only in the main app and only when the user links an app** (never inside the autofill service), fetched straight from the site over HTTPS (no Google API key, nothing sent to Google), cached, and recorded in `DECISIONS.md` with `CLAUDE.md` rule 3 changed by you first. It would add an "official app of this site" hint; it would not remove the certificate pin.

### 6.7 Finding the fields (`FieldClassifier`)

Pure code with unit tests, working on a plain list of nodes (not Android classes):

- A **password field** is: autofill hint `password`, or HTML `type=password`, or `inputType` password variations. A **username field** is: hints `username`/`emailAddress`, HTML `type=email` or `autocomplete=username`, or the visible text field immediately before the password field in order.
- Resource-id words like "user" or "login" are only a last, low-confidence guess and are **not** used when anything better exists.
- Only nodes that are **visible, enabled, have a non-empty size and allow autofill** are considered. Invisible or zero-size fields are never filled (a classic way for a hostile page to harvest credentials).
- If there is no password field, a screen with only a username field (the first step of a two-step login) is not filled in v1.

---

## 7. Fill flow, step by step

1. `onFillRequest` (system calls it; I move work off the main thread, section 9). Parse the structure into `ParsedScreen` (field ids, hints, visibility, package, web domain/scheme). No secrets are involved.
2. Work out the origin (6.1). If the screen has no password field, answer `onSuccess(null)` (no UI at all).
3. Register a **request token**: a random 128-bit value (from `SecureRandom`) stored in memory with the origin, the field ids and a 60-second expiry.
4. Answer with `FillResponse.Builder().setAuthentication(allIds, intentSender, presentation)` where the `IntentSender` starts `AutofillAuthActivity` with only the token as extra. The presentation is a fixed layout: "Unlock KiteVault to fill". It contains **no** account names, domains or page text.
5. `AutofillAuthActivity` looks up the token (unknown or expired means finish and show nothing), does 4.2, 5.2 and 6, and shows a small chooser if there is more than one candidate (title and username only, after the biometric check).
6. It builds a `Dataset` for the chosen login with `AutofillValue.forText(...)` for **only the matched field ids**, returns it in `EXTRA_AUTHENTICATION_RESULT`, and finishes. The token is deleted.
7. The activity uses `FLAG_SECURE`, `filterTouchesWhenObscured`, no entry in Recents, and a translucent theme.

Verify on a device: the `PendingIntent` flags, that the biometric dialog appears correctly over Chrome, and how the framework treats a result the user took more than a few seconds to produce.

---

## 8. Save flow

1. **Offer:** the `FillResponse` carries `SaveInfo` for username + password (so the system shows "Save to KiteVault?" after a successful submit). The system, not KiteVault, draws that dialog.
2. **`onSaveRequest`:** from the structure, take the username and password values, the **origin as the system reports it** (6.1, never text typed on the page), and for apps the package label and certificate. If there is no password or the origin is not trustworthy for the web, stop.
3. **Pending save:** encrypt one JSON record (`username`, `password`, origin, time) with a **second Keystore key, `kitevault_autofill_pending_v1`**: AES-256-GCM, hardware-backed, `setUnlockedDeviceRequired(true)`, **no biometric requirement**. It needs no biometric because the service must write when the user is not present. It protects the file at rest (extraction, a stolen copy of the folder), not against code running in our own process. Records live in `kitevault_autofill_pending.bin` written with `AtomicFile`. At most 3 are kept, the oldest is dropped, and each expires after 10 minutes.
4. **Hand over:** `callback.onSuccess(IntentSender)` (API 28+) opens KiteVault. On API 26/27 only `onSuccess()` is possible; the app then shows a "1 login waiting to be saved" banner the next time it is opened. No notification (a notification would show the domain on the lock screen).
5. **Review screen in the app (React Native):** after unlock (the normal unlock screen: biometric or master password), it shows the origin in large type, the username, the password hidden, and: **Save as new**, or, if an entry for the same origin and username exists with a different password, **Update password** (the old one goes to the password history). Nothing is saved until the user taps. For an app origin, saving also stores the app link with its certificate.
6. **Delete the pending record** only after the vault save succeeded, or when the user dismisses it, or at expiry.

Verify: whether Chrome sends save requests to third-party services. If it does not, saving works in apps only and I will say so in the Settings card.

---

## 9. Threading

- `onFillRequest` / `onSaveRequest` are delivered on the service's main thread. Both only do cheap work (walk the structure, build objects) and run it on a single-thread background executor, honouring the `CancellationSignal`, so the main thread is never blocked and the system's time limit (a few seconds) is respected. Because the heavy work (decryption) happens later, in the activity, the fill callback always returns quickly.
- `BiometricPrompt` is created and shown on the main thread (as the existing `BiometricPrompter` does).
- **Decryption and parsing run on a background thread** after the biometric result, and the result is posted back to the main thread. The activity is not finished until that work ends, and `onDestroy` zeroes anything left over.
- The request-token map and the pending-save file are guarded by one lock; `AtomicFile` makes the file swap safe.
- Reading `vault.kvlt` while the app saves is safe because of the tmp/bak/main rename sequence (5.2). The reader takes no lock the app knows about; that is why it never writes.
- The React Native module calls (`AsyncFunction`) run off the JavaScript thread; they only read the pending file or ask the system.

---

## 10. Credential Manager provider (second step, Android 14+)

- A second service, `KiteVaultCredentialProviderService` (`CredentialProviderService`, permission `BIND_CREDENTIAL_PROVIDER_SERVICE`, capabilities file declaring **only** `android.credentials.TYPE_PASSWORD_CREDENTIAL`).
- `onBeginGetCredentialRequest`: if the vault is locked the response is an `AuthenticationAction` (the same activity and biometric flow); otherwise there is nothing to list without unlocking, so it always returns the `AuthenticationAction` first, then `PasswordCredentialEntry` items for matches.
- **Origin here is better:** `CallingAppInfo` gives the calling **package and signing info supplied by the system**, so the app origin does not depend on trusting a view. Web origins from browsers arrive mainly for passkeys, which are out of scope; passwords in browsers keep coming through the autofill service.
- Saving uses `onBeginCreateCredentialRequest` with a `CreateEntry` whose `PendingIntent` opens the same pending-save path (section 8).
- Same matching rules, same reader, same activity. The new parts are one service class, one capabilities XML and the `androidx.credentials` dependency (I will pick the latest stable version then).

---

## 11. Threat model

| Risk                                                                                       | How it happens                                                           | How we prevent it                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phishing app with a look-alike package** (`com.bank.app.login`, `com.bank.app2`)         | The app asks for autofill and the manager "recognises" the brand         | Exact package name **and** pinned signing certificate. No prefix, brand or title matching. No match means nothing is offered.                                                                                                                   |
| **Clone with the same package name**                                                       | The real app is removed, a repackaged one with another key is sideloaded | The certificate is pinned when the user links the app; a different key does not match. (Does not protect against linking the malicious app in the first place.)                                                                                 |
| **Fake domain** (`bank.com.evil.test`, `bank-com.test`, `evilbank.com`)                    | A lookalike site in the browser                                          | Exact host match, or a subdomain of a registrable domain only; Public Suffix List; no substring or "contains" logic.                                                                                                                            |
| **Look-alike Unicode domain** (`bаnk.com` with a Cyrillic "а")                             | IDN homograph                                                            | Hosts are converted to ASCII punycode before comparing, so they never equal the real name.                                                                                                                                                      |
| **HTTP page**                                                                              | Network attacker changes the page                                        | `https` only; otherwise nothing is filled.                                                                                                                                                                                                      |
| **App lies about its web domain** (custom view reports `bank.com`)                         | A malicious app sets the domain on its own views                         | The reported domain is trusted **only from allow-listed browsers** identified by package and certificate. For any other package it is ignored.                                                                                                  |
| **AutoSpill** (a WebView in an app is filled, and the app's own fields receive the secret) | The dataset includes fields outside the matched form                     | A dataset contains only fields that report the matched origin; in non-browser apps web matches are not used at all, so a WebView login in an app gets nothing unless the app was linked by the user.                                            |
| **Mixed-origin page / cross-origin iframe**                                                | A login form inside an iframe from another site on a trusted page        | All fillable fields must report the same domain as the focused one; otherwise nothing is filled.                                                                                                                                                |
| **Hidden field harvesting**                                                                | A page adds an invisible password field to catch the fill                | Only visible, enabled, non-empty-size fields are filled.                                                                                                                                                                                        |
| **Credentials shown before unlock**                                                        | A dropdown reveals which accounts exist                                  | The dropdown is a fixed "Unlock KiteVault" item. Names appear only after the biometric check, inside our own secure activity.                                                                                                                   |
| **Shoulder-surfing / screenshot of the chooser**                                           | Recording the screen                                                     | `FLAG_SECURE`; the password is never displayed, only written into the target field by the system.                                                                                                                                               |
| **Tapjacking over the chooser or save screen**                                             | Another app draws over our buttons                                       | `filterTouchesWhenObscured` on the chooser and the link-confirmation dialog.                                                                                                                                                                    |
| **Another app launches our authentication activity**                                       | A hostile app sends an intent                                            | The activity is `exported="false"`, accepts only an unexpired in-memory request token, and ignores everything else.                                                                                                                             |
| **Replay of an old authentication**                                                        | An old `IntentSender` is used again                                      | Token is single-use, expires in 60 s, and is bound to the origin it was created for.                                                                                                                                                            |
| **Hostile app triggers a "save"** with a domain it chose                                   | A fake form wants to plant a credential labelled `bank.com`              | The origin comes from the system (6.1), not page text. Nothing is saved until the user reviews it in the app; web origins from non-trusted packages are rejected; an update of an existing password needs an explicit tap and shows the domain. |
| **Pending save read from disk**                                                            | Another process or a file dump reads `kitevault_autofill_pending.bin`    | App-private storage, `allowBackup=false` and the extraction rules still apply, AES-GCM with a hardware key, max 3 records, 10-minute expiry. Residual: code inside our own process (rooted phone, hook) can read it, like the rest of the app.  |
| **Biometric downgrade**                                                                    | A fake or forced fingerprint                                             | Class 3 only, same key, same policy and counters as app unlock (5 uses / 7 days / restart, invalidated on new enrollment). Autofill never relaxes them.                                                                                         |
| **Wrong key or old blob**                                                                  | Vault key changed (restore, password rotate)                             | Decrypt fails the GCM check, nothing is filled, the user is told to open KiteVault; the existing cleanup handles the blob.                                                                                                                      |
| **Secrets in logs**                                                                        | Debug output                                                             | No `Log` calls with request or vault data; no logging of the structure; release build strips verbose logs. A test greps the autofill sources for logging calls.                                                                                 |
| **Another autofill service or accessibility malware**                                      | Reads the screen                                                         | Out of scope: a malicious accessibility service on the phone can already read everything. We set `importantForAutofill` nothing; compatibility mode is not used.                                                                                |
| **Memory remnants**                                                                        | Strings from decrypted JSON linger                                       | Byte arrays and keys are zeroed; `String`s cannot be, so the lifetime is kept to one short-lived activity (limit already recorded for JavaScript in `DECISIONS.md`).                                                                            |
| **Data in transit to the target app**                                                      | The system passes the dataset to the app                                 | Inherent to autofill: the password reaches system_server and the target field. This is why the origin rules above are strict.                                                                                                                   |
| **Play policy / privacy**                                                                  | Autofill touches screen contents                                         | No network, no storage of screen contents; the Data Safety form changes only to mention autofill; the service uses the data only to suggest.                                                                                                    |

Things this design does **not** defend against: a rooted phone or a hooked process, a user who links a malicious app on purpose, a browser on the allow-list that reports a wrong domain, and the weaker security of biometric unlock compared with the master password (already documented in Step 7).

---

## 12. Testing plan

**Automated (I can run these without a phone)**

- **Kotlin unit tests (JUnit, Gradle):** `DomainMatcherTest` (exact, subdomain, public suffixes, IDN/punycode, lookalikes, IP hosts, trailing dots), `FieldClassifierTest`, `OriginRulesTest` (trusted browser vs other package, http, mixed domains, WebView in an app), `VaultReaderTest` (below), `PendingSaveCodecTest` (serialisation and expiry, no Android classes), `MatcherTest` (links, certs, trash, limits).
- **Format fixture:** a script run once produces `vault-fixture.kvlt` with the real TypeScript code and a fixed key, plus the expected JSON; `VaultReaderTest` decrypts it in Kotlin, and also checks: wrong key, flipped bit, truncated file, `.bak` fallback, unknown fields, unknown version, 2,000 entries.
- **TypeScript tests:** the JS side of the module against a fake native module, the pending-save review screen (new, update, dismiss), entry app links (show, remove), the settings card, and a source-level test that fails if the autofill code contains logging or network calls.
- Type-check, lint, the full Jest run, `expo export`, and a build of the Android project to confirm the service and activity appear in the merged manifest.

**Not possible here (needs a real phone, and I will say so in the report)**

The system autofill dialog, the biometric prompt over Chrome, each browser's reported domain, whether Chrome sends save requests, the 5-unlock policy in practice, StrongBox/TEE behaviour, and the IntentSender flags. A manual checklist will be added to `docs/` for you to run.

---

## 13. `CLAUDE.md` rule check

| Rule                                              | Status                                                                                                                                                                                                                            |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Vetted crypto only                              | Platform `javax.crypto` AES/GCM and the Android Keystore. No custom ciphers.                                                                                                                                                      |
| 2 No logging of secrets                           | No logging in the autofill code; enforced by a test.                                                                                                                                                                              |
| 3 No network except Drive backup and breach check | **Holds** in this design (DAL deferred, Q1).                                                                                                                                                                                      |
| 4 Decrypted data in memory only, wiped on lock    | Decryption only inside the short-lived activity; arrays zeroed. The pending save is the one place a password is on disk (encrypted, 10 minutes, hardware key); this is a deliberate exception that you should approve (Q9 below). |
| 5 Randomness                                      | `SecureRandom` for tokens; the Keystore for IVs.                                                                                                                                                                                  |
| 6 AES-256-GCM, fresh IV                           | Reading uses the existing format. The pending file uses a fresh Keystore-chosen IV per record.                                                                                                                                    |
| 7 Never store the master password                 | Not involved.                                                                                                                                                                                                                     |
| 8 `allowBackup=false`                             | Unchanged; the new files are in `filesDir`, already excluded by the extraction rules.                                                                                                                                             |

**Q9 (new): pending saves on disk.** The only alternative that avoids a password on disk is to hold it in memory only, which would be lost if the process is killed before the user opens KiteVault, and to open the app immediately. I recommend the encrypted pending record with a 10-minute life; please confirm.

---

## 14. Files

### 14.1 Files I will create

Kotlin, under `src/native/keystore/android/src/main/java/expo/modules/kitevaultkeystore/autofill/`:

| File                          | Purpose                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `KiteVaultAutofillService.kt` | The `AutofillService`: fill (locked placeholder), save, request-token registry use |
| `AutofillAuthActivity.kt`     | Secure activity: biometric, decrypt, match, chooser, return `Dataset`              |
| `VaultKeyUnlocker.kt`         | The unlock steps extracted from `KeystoreModule` (section 4.3)                     |
| `VaultReader.kt`              | Locate and decrypt the vault, stream-parse logins, wipe                            |
| `StructureParser.kt`          | `AssistStructure` to `ParsedScreen` (plain data)                                   |
| `FieldClassifier.kt`          | Find username/password fields, visibility rules                                    |
| `RequestOrigin.kt`            | Web vs app origin, trust rules, http/mixed-domain checks                           |
| `TrustedBrowsers.kt`          | Allow-list of browsers (package + certificate)                                     |
| `AppIdentity.kt`              | App label and signing certificate SHA-256 through `PackageManager`                 |
| `DomainMatcher.kt`            | Host normalisation, IDN, subdomain-of-registrable-domain rule                      |
| `PublicSuffixList.kt`         | Loads and queries the bundled list                                                 |
| `LoginMatcher.kt`             | Choose entries for an origin (web addresses and app links)                         |
| `RequestRegistry.kt`          | In-memory single-use request tokens with expiry                                    |
| `PendingSaveStore.kt`         | Encrypted pending saves (second Keystore key)                                      |
| `AutofillModule.kt`           | Expo module `KitevaultAutofill` for JavaScript                                     |

Android resources and tests:

| File                                                                                                                                                                                                  | Purpose                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `src/native/keystore/android/src/main/res/xml/kitevault_autofill_service.xml`                                                                                                                         | Service configuration                         |
| `.../res/layout/autofill_locked_item.xml`                                                                                                                                                             | Fixed "Unlock KiteVault" dropdown item        |
| `.../res/values/autofill_strings.xml` and `autofill_themes.xml`                                                                                                                                       | Texts and the translucent theme               |
| `.../res/raw/public_suffix_list.dat`                                                                                                                                                                  | Bundled Public Suffix List                    |
| `src/native/keystore/android/src/test/java/.../autofill/DomainMatcherTest.kt`, `FieldClassifierTest.kt`, `OriginRulesTest.kt`, `VaultReaderTest.kt`, `LoginMatcherTest.kt`, `PendingSaveCodecTest.kt` | Unit tests                                    |
| `src/native/keystore/android/src/test/resources/vault-fixture.kvlt` and `vault-fixture.json`                                                                                                          | Real-format test vault and expected content   |
| `scripts/make-autofill-fixture.ts` (run with the project's own TypeScript tooling)                                                                                                                    | Produces the fixture from the real vault code |

TypeScript:

| File                                             | Purpose                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------- |
| `src/native/keystore/autofill.ts`                | Typed wrapper for `KitevaultAutofill` (status, enable, pending saves)     |
| `src/native/keystore/__tests__/autofill.test.ts` | Tests against a fake native module                                        |
| `src/features/autofill/AutofillSettingsCard.tsx` | Settings card: status, enable button, requirements, Chrome instructions   |
| `src/features/autofill/PendingSaveScreen.tsx`    | Review screen: save new / update / dismiss                                |
| `src/features/autofill/pendingSaveActions.ts`    | Creates or updates the entry, links the app, then acknowledges the record |
| `src/features/autofill/AppLinksSection.tsx`      | Linked apps with Remove, used in the entry edit screen                    |
| `src/features/autofill/__tests__/*.test.tsx`     | Screen and action tests                                                   |
| `src/app/autofill-save.tsx`                      | Route for the review screen                                               |

Documentation:

| File                                                                                                                         | Purpose                     |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `docs/AUTOFILL_TESTING.md`                                                                                                   | Manual device checklist     |
| (later, step 2) `.../autofill/KiteVaultCredentialProviderService.kt`, `.../res/xml/kitevault_credential_provider.xml`, tests | Credential Manager provider |

### 14.2 Existing files I will change

| File                                                       | Change                                                                                                                            |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `src/native/keystore/android/src/main/AndroidManifest.xml` | Declare the autofill service, the authentication activity, `<queries>` for the browsers (to read their settings)                  |
| `src/native/keystore/expo-module.config.json`              | Add `KitevaultAutofill` to the module list                                                                                        |
| `src/native/keystore/android/build.gradle`                 | Test resources / any test dependencies; later `androidx.credentials`                                                              |
| `.../kitevaultkeystore/KeystoreModule.kt`                  | Call the extracted `VaultKeyUnlocker` (behaviour unchanged)                                                                       |
| `.../kitevaultkeystore/BiometricPrompter.kt`               | Make the prompt reusable from the new activity (titles and the origin line)                                                       |
| `src/vault/types.ts`, `src/vault/index.ts`                 | New optional `appLinks` field on `Entry` (data version stays 1)                                                                   |
| `src/features/entries/entrySchema.ts`                      | Keep `appLinks` when an entry is edited                                                                                           |
| `src/features/entries/entryActions.ts`                     | Add/remove app link, create entry from a pending save                                                                             |
| `src/features/entries/EntryFormScreen.tsx`                 | Show linked apps with Remove                                                                                                      |
| `src/features/settings/SettingsForm.tsx`                   | Add the Autofill card                                                                                                             |
| `src/app/_layout.tsx`                                      | Register the review route; after unlock, show "login waiting to be saved"                                                         |
| `src/vault/merge.ts`                                       | Union the `appLinks` of both sides (covered by its tests)                                                                         |
| `src/features/transfer/parsers.ts`, `csvExport.ts`         | Keep `androidapp://` addresses from being treated as web addresses; export linked apps as `androidapp://package` (no certificate) |
| `src/features/about/extraLicenses.ts`                      | Public Suffix List notice (MPL-2.0)                                                                                               |
| `docs/DECISIONS.md`                                        | Summary of the final decisions and limits                                                                                         |

Not changed: `app.json` and `plugins/` (no config plugin is planned; see section 1), `CLAUDE.md` (only if you choose DAL in v1).

---

## 15. Proposed order of work (each step reported and tested before the next)

1. **Kotlin core and tests:** `VaultReader` with the real-format fixture, `DomainMatcher` + Public Suffix List, `FieldClassifier`, `RequestOrigin`, `LoginMatcher`. All unit-tested, no Android UI yet.
2. **Fill:** the service, the authentication activity, `VaultKeyUnlocker` refactor, `AutofillModule`, the Settings card, manifest. Manual device test checklist.
3. **Save and app links:** pending saves, review screen, entry app links, merge and import/export changes.
4. **Credential Manager provider** (Android 14+).

Please answer Q1 to Q9 above, or just say "go with your recommendations", and tell me whether to start with step 1.
