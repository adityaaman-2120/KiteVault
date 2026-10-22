# KiteVault security review

Reviewed: 2026-10-22, by the same assistant that wrote most of the code (read the bias warning below).
Scope: the whole repository as it stands after the autofill save step. No features were added; things were fixed or documented.

> **This document does not say KiteVault is secure.** It lists what was checked, what was found, what was changed, and, more importantly, what was _not_ verified. Most of the real risk sits in the last two sections.

**Bias warning.** The reviewer wrote the code under review and had no access to a phone, a network capture, or a second pair of eyes. A review by the author finds the mistakes the author can imagine. Treat this as a thorough self-audit, not as an independent audit.

---

## 1. How the review was done

- Read the code for the areas below, searched the whole repository with patterns (not just files I remembered), and turned the useful searches into tests (`src/__tests__/securityRegression.test.ts`, `src/native/keystore/__tests__/autofillSources.test.ts`) so a fixed problem cannot quietly return.
- Generated the Android project (`expo prebuild`), merged the manifests with Gradle (release and debug), and read the result.
- Ran `npm audit`, `npm outdated`, `expo-doctor`, and checked release dates of the security-relevant packages with `npm view`.
- Ran the checks that exist: type-check, ESLint, **1,306** Jest tests, **121** Kotlin unit tests (Gradle), `expo export`.

Severity scale: **High** = could expose vault contents or break a stated rule in normal use. **Medium** = needs a specific situation (another app, a rooted phone, a bug elsewhere). **Low** = hardening or small leak. **Info** = no action needed now.
Status: **Fixed** (changed and tested), **Mitigated** (reduced, not eliminated), **Open** (not changed), **Unverified** (a fix or claim that needs a device to confirm).

---

## 2. Findings

| ID   | Severity | Status                               | Finding                                                                                                                                                                                                                                                                                |
| ---- | -------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-01 | **High** | Mitigated, **Unverified**            | The app contains Google ML Kit (pulled in by the QR scanner) and Google's Data Transport library. Google says ML Kit may send technical and performance data to Google, with no supported off switch. That conflicts with CLAUDE.md rule 3 and with the app's own "no analytics" text. |
| F-02 | Medium   | Fixed                                | Any `kitevault://...` link could steer the (unlocked) app to any screen, for example Export or Change password.                                                                                                                                                                        |
| F-03 | Medium   | Fixed (device effect **Unverified**) | Autofill could have been asked about KiteVault's own screens; a "Save to KiteVault?" offer for the master password was conceivable.                                                                                                                                                    |
| F-04 | Medium   | Fixed (**Unverified**)               | Copied passwords were shown in Android 13+'s clipboard preview.                                                                                                                                                                                                                        |
| F-05 | Low      | Fixed                                | Saved web addresses with `user@`, backslashes or control characters could disguise the real host in autofill matching.                                                                                                                                                                 |
| F-06 | Low      | Fixed                                | An app's self-chosen name (invisible or direction-flipping characters, line breaks, huge length) was shown in security prompts.                                                                                                                                                        |
| F-07 | Low      | Fixed                                | A file picked for import was left in the app cache when it was refused for being too large.                                                                                                                                                                                            |
| F-08 | Low      | Fixed                                | "Erase vault" did not remove an export file left in the cache by an interrupted share.                                                                                                                                                                                                 |
| F-09 | Low      | Fixed                                | The unused `VIBRATE` permission was in the manifest.                                                                                                                                                                                                                                   |
| F-10 | Low      | Mitigated                            | After an import the screen kept a second copy of the imported passwords in memory until it closed.                                                                                                                                                                                     |
| F-11 | Medium   | **Open**                             | The vault file's header is not authenticated and the body is not bound to it (rollback / swap of an old body is possible for anyone who can write the file).                                                                                                                           |
| F-12 | Medium   | **Open**                             | Screenshot protection is switched on from JavaScript after start-up and gives up after 8 failed attempts (fails open).                                                                                                                                                                 |
| F-13 | Medium   | **Open**                             | No protection against tap-jacking (another app drawing over KiteVault) on KiteVault's own screens; only the autofill card has it.                                                                                                                                                      |
| F-14 | Medium   | **Open**                             | The unlock-attempt limiter, the biometric counters and settings are ordinary files and preferences. Anyone who can write the app's private folder can reset them. They do not protect a copied vault file.                                                                             |
| F-15 | Low      | **Open**                             | Auto-lock after backgrounding compares wall-clock times (`Date.now()`). A clock set backwards by less than the time spent away can delay the lock.                                                                                                                                     |
| F-16 | Medium   | **Open**, **Unverified**             | Autofill relies on browsers reporting the page's address correctly. Only Google's published browser list and certificates are trusted, but nothing has been tried on a device.                                                                                                         |
| F-17 | Low      | **Open**                             | Pending autofill saves (up to 10 minutes) are sealed by a key that needs no fingerprint; code inside the app process can read them.                                                                                                                                                    |
| F-18 | Info     | Documented                           | Decrypted data cannot be wiped from JavaScript or Kotlin memory (strings). It stays until garbage collection after lock. A merge also keeps both vault copies alive for a while.                                                                                                       |
| F-19 | Low      | **Open**                             | File providers from `expo-sharing` and `expo-file-system` cover the whole files and cache folders. They are not exported, so only URIs the app itself hands out are reachable.                                                                                                         |
| F-20 | Info     | Documented                           | The release build still declares the development client's `exp+kitevault` scheme next to `kitevault` (both neutralised by F-02).                                                                                                                                                       |
| F-21 | Info     | Documented                           | `npm audit`: 50 findings, **all in build and test tooling** (Metro, EAS code signing, Jest). Three distinct advisories, and **no fixed version exists on npm today**. Nothing flagged is shipped in the app.                                                                           |
| F-22 | Info     | Documented                           | Root detection is a warning only and depends on `jail-monkey` and RootBeer, which are lightly maintained. It is bypassable by design.                                                                                                                                                  |
| F-23 | Info     | Documented                           | No certificate pinning for Google Drive or Have I Been Pwned. Normal TLS with the system's trusted certificate authorities.                                                                                                                                                            |
| F-24 | Info     | Documented                           | A throw-away test vault and its key are committed for the Kotlin tests (`vault-fixture.*`). They protect nothing real.                                                                                                                                                                 |

---

## 3. What was changed (and how it is checked)

**F-01. ML Kit / Data Transport.** `plugins/withNoTelemetry.js` removes `TransportBackendDiscovery`, the component that tells Google's Data Transport library which servers it may deliver to. With no destination, the library cannot send an event. This is a workaround, not a supported switch: **it has not been run**. Possible failure: QR scanning could misbehave. Test list in section 8. If it breaks scanning, remove the plugin line from `app.json` and choose between (a) using Google's system code scanner (`launchScanner`), where scanning runs inside Google Play services and not in this app, (b) accepting ML Kit's data collection and rewriting the "no analytics" claims, or (c) removing QR scanning and keeping paste-only entry of 2FA secrets. Until a network capture shows the app's traffic, **do not repeat the "no analytics" claim publicly.** Checked by: `plugins/__tests__/noTelemetryPlugin.test.ts` (the manifest entry), and the merged release manifest (section 5).

**F-02. Deep links.** `src/app/+native-intent.tsx` makes every link or intent from outside open the app normally (`/`). The lock still decides which screen follows. Nothing in KiteVault needs an outside link: autofill opens the app with a plain launcher intent that carries no data. Checked by tests with `kitevault://export`, `kitevault://entry/...`, the development-client form, `https://` and `javascript:` addresses.

**F-03. Own-package guard.** The autofill service ignores requests (fill and save) whose screen belongs to KiteVault itself, so the master password field can never be offered or saved. Master-password fields were already marked `importantForAutofill="no"`; this is the second layer. Checked by a source test (two guards). _Whether Android ever sent such requests was not checked on a device._

**F-04. Clipboard preview.** `ClipboardModule.kt` copies with Android's "sensitive" flag (`android.content.extra.IS_SENSITIVE`) so Android 13+ hides the text in its clipboard preview. Phones or builds without the module fall back to the old clipboard. Clearing is unchanged. Checked by `sensitiveClip.test.ts` and a source test. _Whether keyboards with a clipboard history (Gboard and others) honour the flag was not checked._

**F-05. Disguised addresses.** `DomainMatcher.normalizeHost` (Kotlin) refuses addresses containing `@`, a backslash or a control character; `hostOf` (TypeScript, used for update matching and 2FA hints) refuses backslashes. Example: `https://evil.test\@bank.com` is read by browsers as `evil.test` but would have been read as `bank.com` here. New Kotlin and Jest tests.

**F-06. App names.** `LabelSanitizer.kt` strips invisible and direction-changing characters, turns line breaks into spaces and cuts names to 60 characters. The package name is always shown next to the name. 5 new Kotlin tests (one of them found a real bug in the first version: line breaks glued words together).

**F-07/F-08. Leftover files.** The picker copy is now deleted on every path, including "too large" (test creates a real cache file and checks it is gone). `eraseEverything` also purges `kitevault-exports` (test).

**F-09. Permission.** `android.permission.VIBRATE` added to `blockedPermissions`; a config test checks the list.

**F-10. Import screen.** After a successful import the parsed entries are dropped from the screen's state.

**Regression tests added** (`src/__tests__/securityRegression.test.ts`): no `Math.random`, no `console.*`, no analytics or crash-reporting library, no general storage library (AsyncStorage, SecureStore, localStorage, SQLite), no `printToFileAsync` or photo-taking APIs, no error text built from variables, the only web hosts in code are the Drive and Have I Been Pwned hosts, `allowBackup=false`, blocked permissions, no microphone, outside links neutralised, and the Kotlin guards above.

---

## 4. Open findings: what to do

**F-11 Unauthenticated header, unbound body (Medium).** An attacker who can write `vault.kvlt` can swap in an older body of the same vault (rollback) or damage the header to make a good vault look like a wrong password. They cannot read or forge entries. Fix: format version 2 with the header (and a body counter) as GCM associated data. Needs a migration plan and tests; **do not rush it**. Already noted in `docs/DECISIONS.md`.

**F-12 Screen protection fails open (Medium).** `FLAG_SECURE` is requested from JavaScript (`expo-screen-capture`) and retried 8 times over 2 seconds; after that the screen is unprotected until the next state change. A native `FLAG_SECURE` set in `MainActivity.onCreate` (and relaxed from JavaScript only when the user allows screenshots) would close the gap. Needs a device test because it changes the first frame and the recent-apps preview.

**F-13 Tap-jacking (Medium).** Only meaningful if the user installed an app with the "draw over other apps" permission. `filterTouchesWhenObscured` on the main window would help; React Native does not offer it per screen, so it needs a small native change.

**F-14 Local counters are files (Medium).** Documented limit (`DECISIONS.md`). The real protection against copied files is the master password and Argon2id. A stronger limiter is not possible offline.

**F-15 Clock (Low).** Use a monotonic clock for the background-lock comparison (Android `elapsedRealtime`, as the biometric policy already does). The current code does lock when the clock jumps backwards past the moment of leaving (negative elapsed time).

**F-16 Browser trust (Medium).** See section 8.

**F-17 Pending saves (Low).** Accepted trade-off (approved as Q9); 10 minutes, 3 records.

**F-19 File providers (Low).** Could be replaced by a narrower provider that only covers the export folder.

---

## 5. What was checked and looked right

**Logging.** No `console.*`, `Log.*`, `println`, `printStackTrace` or logging library in the app or the Kotlin code (the only `console` calls are in two developer scripts that print file counts). Error classes carry a code, not data. A test enforces it.

**Randomness.** No `Math.random` anywhere in the app. Ids, IVs, salts, tickets and device ids come from OpenSSL (`react-native-quick-crypto`), `SecureRandom`, or the Android Keystore. The generator's uniform picker is tested to reject modulo bias.

**Secrets at rest.** What exists on the phone, and what each holds:

| File or store                                 | Holds                                                                                                              | Protected by                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `vault.kvlt` (+ `.tmp`, `.bak` during a save) | the vault                                                                                                          | AES-256-GCM with a random vault key, wrapped by an Argon2id key             |
| `kitevault_biometric_blob.bin`                | the vault key                                                                                                      | Android Keystore key that needs a Class 3 fingerprint or face for every use |
| `kitevault_biometric_meta` preferences        | counters and times                                                                                                 | none (no secrets)                                                           |
| `kitevault_autofill_pending.bin`              | up to 3 logins waiting to be saved, up to 10 minutes                                                               | Keystore key, no fingerprint (F-17)                                         |
| `settings.json`                               | on/off switches, times, a random device id, the Google Drive file id                                               | none; no secrets (a test lists the keys)                                    |
| `unlock-attempts.json`                        | failed-attempt count and time                                                                                      | none (F-14)                                                                 |
| Android Keystore                              | the two keys above                                                                                                 | hardware where available                                                    |
| Google Play services                          | the Google sign-in                                                                                                 | Google                                                                      |
| Cache                                         | nothing, except for the moment of a share (CSV or .kvault) or a picked import file, deleted afterwards (see below) |                                                                             |

The master password and the recovery key are never stored. No secret is kept in AsyncStorage, SecureStore, SQLite or web storage (a test checks the imports).

**Temporary files.** Vault saves write the encrypted bytes to `.tmp` first and rename; the `.bak` is deleted after a successful save; erase removes all three. Shared exports live in `cache/kitevault-exports`, are deleted right after sharing (also on failure), when the export screen opens, at app start, and on erase. The picker copy is deleted after reading. The recovery key PDF uses the print dialog and never writes a file (`printToFileAsync` is banned by a test). Camera frames are never saved (no photo or video API is called; a test checks).

**Cleared on lock.** `lock()` drops the store's reference first and then zeroes the vault key and empties the in-memory vault (entries, passwords, notes, custom fields, history, card and identity details). The unlocked screens leave the navigation tree, so their state is released. Not cleared by lock: titles, user names and addresses inside the emptied arrays are only dereferenced (F-18), the clipboard (a copied password stays until its timer, which is deliberate and documented), and the pending-save file (up to 10 minutes, F-17).

**Cleared on background.** The vault locks after the chosen time away (default 30 seconds, "immediately" is available), checked both by a timer and by comparing times when the app returns. Closing the app ends the process and with it the memory. While backgrounded and still unlocked, the recent-apps preview is blocked (unless the user allowed screenshots). Gap: F-12, F-15.

**Cleared on erase.** `eraseEverything` removes the vault files, the biometric key and blob and counters, waiting autofill saves and their key, leftover export files, all settings and the attempt counter, signs out of Google, and returns to the welcome screen. It is ordered so that a vault file that cannot be deleted stops everything else (the app never claims to have erased what is still there). Old file blocks may remain on flash storage (not controllable).

**Android manifest (release, merged).**

- Components that are exported: `MainActivity` (needed), our autofill service (protected by `BIND_AUTOFILL_SERVICE`, so only the system can bind), Google Sign-In's `RevocationBoundService` (protected by its own permission), and AndroidX's `ProfileInstallReceiver` (protected by `DUMP`). Everything else, including our unlock activity, the file providers and ML Kit components, is not exported.
- Permissions: `INTERNET`, `CAMERA` (asked only when scanning), `USE_BIOMETRIC`, `USE_FINGERPRINT` (needed for Android 8 and 9), `ACCESS_NETWORK_STATE` (pulled in by libraries; not used by KiteVault code; left because removing it could crash a library), and an AndroidX signature permission. After this review `VIBRATE` is gone (confirmed in the rebuilt release manifest, where the Data Transport destination list from F-01 is gone too). No storage, microphone, location, contacts, SMS or overlay permission, and no `QUERY_ALL_PACKAGES` (the narrow launcher `<queries>` entry is used instead).
- `allowBackup="false"`, data-extraction and full-backup rules exclude every storage area, `debuggable` is not set, cleartext traffic is not enabled, and the development launcher is not in the release manifest.

**Intents and links.** Entry addresses are opened only if they are http or https (`javascript:`, `intent:`, `file:` and `tel:` are refused; tested). The only intents the app creates are: Android's autofill settings page, the Downloads page, the share sheet for the user's own export, the launcher intent that autofill uses to open KiteVault (no extras), and the autofill unlock activity (a random one-time ticket). Outside links are neutralised (F-02).

**Autofill** (details in `docs/AUTOFILL_DESIGN.md`, section 11): locked placeholder before any data; biometric check with the Keystore key; strict domain and package-plus-certificate matching; web addresses trusted only from allow-listed browsers over https; ordinary apps' claimed web addresses ignored; hidden fields, sign-up forms and mixed-site pages not filled; one-time tickets; non-exported activity with `FLAG_SECURE`; the service never writes the vault.

**Network.** The only hosts in the code are the Google Drive API (optional backup) and `api.pwnedpasswords.com` (optional breach check; only a 5-character hash prefix, with response padding). Tests assert both. See F-01 for the part this cannot see.

---

## 6. Dependencies

`npm audit` (run 2026-10-22): **50 findings (18 moderate, 32 high, 0 critical).** There are only **three distinct advisories**; everything else is a package that depends on them:

| Package (installed) | Advisory                                                                            | Where it comes from                                |
| ------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------- |
| `braces` 3.0.3      | GHSA-vfj7-8cjw-p6xm, stack-exhaustion denial of service with deeply nested patterns | Metro and Jest file matching                       |
| `node-forge` 1.4.0  | GHSA-86w9-cpqp-85rv, RSA PKCS#1 v1.5 signature check accepts extra elements         | `@expo/code-signing-certificates` (Expo CLI / EAS) |
| `sprintf-js` 1.0.3  | GHSA-hp3w-g68c-fv3c, denial of service through unbounded precision                  | Jest / argparse                                    |

All three are used by **build, test and CLI tools on the developer's computer**, not by the app on the phone (none is in the app's JavaScript runtime path). The installed versions are the newest on npm, so **no fixed release exists yet**. `npm audit` offers "fixes" that downgrade Expo to version 44 or React Native to 0.72: **ignore them, they would break the project.** What to do: keep the lockfile, run `npm audit` again after each Expo upgrade, and do not run the build tools on untrusted projects or inputs.

**Outdated** (`npm outdated`, `expo-doctor`): 9 patch updates are available (`expo` 58.0.17, `expo-router` 58.0.25, `expo-clipboard` 58.0.4, `expo-constants`, `expo-linking`, `expo-screen-capture`, `expo-splash-screen`, `expo-status-bar`, `jest-expo`; also `react` 19.3.1 and `zustand` 5.0.16). I did not apply them, because I cannot run the app to see that nothing broke; run `npx expo install --check` and test on a phone. Major versions exist for `eslint` 10, `typescript` 7, `@hookform/resolvers` 6 and `@types/node` 26 (development tools, no security reason to hurry).

**Security-relevant packages and how alive they are** (last npm release):

| Package                                     | Version              | Last release | Note                                                                            |
| ------------------------------------------- | -------------------- | ------------ | ------------------------------------------------------------------------------- |
| `react-native-quick-crypto`                 | 1.1.8                | 2026-10-08   | Carries OpenSSL: track its CVEs. The only crypto library used                   |
| `react-native-nitro-modules`                | 0.37.1               | 2026-10-21   | its dependency                                                                  |
| `@react-native-google-signin/google-signin` | 16.1.5               | 2026-09-03   |                                                                                 |
| `otpauth`                                   | 9.5.2                | 2026-09-03   | pulls `@noble/hashes`                                                           |
| `papaparse`                                 | 5.7.0                | 2026-08-24   | parses untrusted CSV                                                            |
| `@zxcvbn-ts/core`                           | 4.2.0                | 2026-08-12   |                                                                                 |
| `jail-monkey`                               | 3.0.0                | 2026-04-28   | wraps RootBeer (older, lightly maintained): treat root detection as a hint only |
| `react-native-quick-base64`                 | 3.0.1                | 2026-07-08   |                                                                                 |
| `androidx.biometric`                        | 1.1.0                | old          | Google's stable release; check for a newer one                                  |
| ML Kit (inside `expo-camera`)               | common 18.11.0       |              | see F-01                                                                        |
| Public Suffix List (bundled file)           | 2026-10-20           |              | **goes stale: refresh it before each release**                                  |
| Trusted-browser certificates                | generated 2026-10-21 |              | refresh with `scripts/make-trusted-browsers.js`; review the diff                |

No package here looked abandoned. That is a statement about release dates, not about quality or about unknown vulnerabilities.

---

## 7. What I could not verify

- **Anything on a real phone.** The fingerprint dialog, Keystore behaviour (StrongBox or TEE), autofill in any browser or app, Android 8 to 15 differences, the clipboard preview, screen-capture blocking, the share sheet, the camera, and every item in `docs/AUTOFILL_TESTING.md`.
- **Network traffic.** I did not capture what the app sends. In particular: whether ML Kit or Data Transport sends anything (F-01), whether the removal in F-01 works and leaves QR scanning working, whether Google Play services or Sign-In contact Google outside the user's actions.
- **A release build.** I merged the release manifest but did not build, install or minify (R8) a release APK, and did not inspect the JavaScript bundle or Hermes bytecode for leftovers.
- **Memory.** I did not inspect process memory; the claims about cleared data come from reading the code. Hermes and the JVM copy strings, so passwords may remain in memory for a while after lock (F-18).
- **Native library internals.** I did not review the code of `react-native-quick-crypto`, OpenSSL, `otpauth`, `jail-monkey`, Expo or React Native, or check that Argon2id in `react-native-quick-crypto` returns correct values beyond its own tests and the app's round-trip tests.
- **Concurrency under stress.** Overlapping saves, autofill while the app is saving, a crash at every possible instruction. Only the interruption points listed in `DECISIONS.md` are tested.
- **Other apps' behaviour.** What websites and apps put in their forms, how password managers' attacks evolve (AutoSpill and similar), and whether browsers on the trusted list report addresses honestly.
- **The legal and store side.** Google OAuth verification, Play Data Safety answers, privacy policy wording, export rules for cryptography.
- **Supply chain.** Whether any dependency (or its dependencies) is malicious today. `npm audit` only knows published advisories.
- **Claims in the interface.** The About screen says there is "no analytics". Until F-01 is verified, treat that sentence as unproven.

---

## 8. What you must still review by hand, or pay an expert to review

**Do yourself, soon (hours):**

1. **Network capture (F-01).** Run the release build on a phone behind a proxy or a firewall app (for example mitmproxy with a user certificate on a test phone, or NetGuard) and use every feature once, including QR scanning. Expect connections only to Google (sign-in/Drive, only when you use the backup) and `api.pwnedpasswords.com` (only when you tap the breach check). Anything else, especially `firebaselogging-pa.googleapis.com` or other Google logging hosts, means F-01 is not fixed.
2. **QR scanning after the F-01 change.** Scan a real 2FA QR code, type a secret, scan a wrong QR code, deny the camera permission. If scanning crashes or hangs, see F-01 for the options.
3. **Run `docs/AUTOFILL_TESTING.md` completely** on at least two phones (one Android 9 to 11, one Android 14 or newer) and record failures.
4. **Check the clipboard preview** on Android 13 or newer: copy a password, look at the keyboard's clipboard bubble and the keyboard's own clipboard history.
5. **Confirm the manifest** of the release build you will publish (`apkanalyzer manifest print app-release.apk`): permissions and exported components as in section 5.
6. **Read the three autofill browser lists again** (`TrustedBrowserData.kt`): every package you do not use is risk without benefit. Trim it.
7. **Decide the tap-jacking and screenshot gaps** (F-12, F-13): both need a small native change and a device test.

**Pay an expert for (days):**

1. **A cryptography review of the vault format and key hierarchy**: header and body binding (F-11), the recovery key wrap, the Argon2id parameters and floor, the AES-GCM use (random 96-bit IVs with one key), the biometric wrapping and its policy, and the format-version-2 design. This is the single most valuable review.
2. **An Android application penetration test** on a rooted and a non-rooted phone: intent fuzzing, the exported autofill service, the unlock activity under overlays, file provider reachability, backup/extraction rules, `adb` extraction, dynamic instrumentation (Frida) to see what an attacker with code inside the process obtains and when it is wiped, and screen-capture and accessibility-service attacks.
3. **An autofill-specific review**: phishing and spoofing scenarios against real browsers and apps (the AutoSpill class of attacks, look-alike domains, in-app browsers, iframes), the Public Suffix List update process, and package-visibility behaviour across Android versions. Autofill is where password managers have most often failed.
4. **A supply-chain and build-pipeline review**: lockfile policy, who can publish and sign, EAS credentials and key custody, reproducible builds, dependency update process, and how the trusted-browser list and the Public Suffix List are updated safely.
5. **A privacy review before publishing**: the exact data Google receives (Sign-In, Drive, Play services, ML Kit), the Data Safety form, the privacy policy, and the wording of "no analytics".
6. **Re-test after any fix to F-11 to F-15**, because they touch the vault file, the first screen drawn, and the lock logic.

**Before anyone else's passwords go into this app:** do at least the cryptography review, the network capture and the Android penetration test. Until then the app has been built carefully and tested by its author, which is not the same as being safe to trust with other people's secrets.

---

## 9. Re-running the checks

```
npx tsc --noEmit && npx eslint src plugins && npx jest        # app and plugin tests, including the regression tests
npm audit ; npm outdated ; npx expo-doctor
npx expo prebuild --platform android --no-install              # then, inside android/:
gradlew :keystore:testDebugUnitTest :app:processReleaseMainManifest
# merged manifest: android/app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml
```

Delete the generated `android/` folder afterwards; it is not part of the repository.
