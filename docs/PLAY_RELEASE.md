# Google Play release guide

Everything needed to take KiteVault from a working build to the Play Store. Facts about the app were
checked against the code and the merged release manifest (2026-10-24). Policy facts come from Google's
pages and change over time, so re-read the linked page before you submit.

## 1. Build and signing

| Item         | Value                                                                               | Where                                           |
| ------------ | ----------------------------------------------------------------------------------- | ----------------------------------------------- |
| Package      | `com.kitelux.kitevault`                                                             | `app.json`                                      |
| Output       | Android App Bundle (AAB), explicit                                                  | `eas.json` `build.production.android.buildType` |
| Version name | `1.0.0` (you change it by hand for a new public version)                            | `app.json` `version`                            |
| Version code | Raised by 1 on every production build by EAS                                        | `appVersionSource: remote` + `autoIncrement`    |
| Target SDK   | 36 (the Expo default). Play needs API 36 for new apps and updates after 31 Aug 2026 | merged manifest                                 |
| Min SDK      | 26                                                                                  | `app.json` build-properties                     |
| Backup       | `allowBackup="false"`                                                               | merged manifest                                 |
| Submit       | Goes to the **internal** track as a **draft**                                       | `eas.json` `submit.production`                  |

Commands (run by you, they need your Expo login):

```
eas build --platform android --profile production
eas submit --platform android --profile production   # needs the Play service-account key, see 6
```

The first production build asks EAS to create the **upload key**. Let EAS generate it. Never put a
keystore, its password or the Play service-account JSON in this repository.

### Play App Signing and the Google sign-in SHA-1

Play re-signs your app with its own **app signing key**. So the installed app has a different SHA-1 from
the build you uploaded. Google sign-in (cloud backup) needs every one of these registered as an Android
OAuth client (package `com.kitelux.kitevault` + SHA-1):

1. Debug key (already done).
2. EAS development key (already done).
3. EAS production **upload** key: `eas credentials` → Android → production → show the SHA-1.
4. Play **app signing** key: Play Console → Test and release → Setup → App signing → "App signing key
   certificate" SHA-1. This one is what real users get. Without it, backup shows "not set up correctly".

Also: Google Auth Platform → Audience → **Publish app** (move from Testing to In production), or only
the test users you listed can sign in. Fingerprints are public, so they can be pasted in `GOOGLE_SETUP.md`.

16 KB pages: Play now requires native libraries to support 16 KB memory pages. Expo SDK 58 and React
Native 0.88 ship compatible libraries. Check with the Play Console pre-launch report or "Analyze APK" on
the first bundle; if Play warns, update the named library.

## 2. Privacy policy

Hosted: https://kitelux.com/vault/privacy/ and terms https://kitelux.com/vault/terms/. They cover: no
analytics, no servers, data stays on the phone, optional encrypted Drive backup with the `drive.appdata`
scope, the Limited Use statement, deletion.

Add these before submitting (they are on your website, not in this repo):

- Privacy page, Google sign-in section: _"If you turn on backup, KiteVault shows the email address of the
  Google account you chose so you can see which account is used. It is kept only in the app's memory
  while it is open. We never receive it."_
- Privacy page, a short section for each of: _Autofill_ ("KiteVault only fills when you unlock it, and
  only on the site or app it was saved for. Nothing is sent anywhere."), _Camera_ ("Used only to scan a
  two-factor setup QR code. Pictures are never saved or sent."), _Copy to clipboard_ ("Copied passwords
  are cleared from the clipboard after a short time.") — check the clear time in Settings matches.
- Home page: it says "No accounts". Add: "Optional backup uses your own Google Drive."

Also put the privacy URL in Play Console → App content → Privacy policy.

## 3. Store listing draft

Developer name: Kitelux. Category: Tools (or Productivity). Tags: Security, Password manager.

**Title** (max 30): `KiteVault: Password Manager`

**Short description** (max 80): `Offline password manager. Encrypted on your phone. No accounts, no tracking.`

**Full description** (max 4000):

```
KiteVault keeps your passwords on your phone, locked with strong encryption. No account to create. No
server. No ads. No tracking.

PRIVATE BY DESIGN
• Your vault is encrypted on your device with AES-256-GCM.
• Your master password is turned into a key with Argon2id. It is never stored anywhere.
• No analytics and no ads. KiteVault has no servers of its own.
• The vault is wiped from memory the moment it locks.

AUTOFILL, WITH YOUR PERMISSION
• Fill logins in apps and in your browser after you unlock with your fingerprint or master password.
• Only fills on the website or app a login was saved for.
• Suggests a strong password when you sign up, and offers to save new logins.

EVERYTHING YOU NEED
• Passwords, secure notes and two-factor codes in one place.
• Strong password generator.
• Folders, favourites, search and a Trash with restore.
• Fingerprint or face unlock.
• Recovery key as a printable PDF, in case you forget your master password.
• Copied passwords clear from the clipboard automatically.

YOUR BACKUP, YOUR CHOICE
• Backups are optional. If you turn them on, only the already-encrypted vault file goes to a private
  area of your own Google Drive. Google and Kitelux cannot read it.
• Optional breach check sends only a small piece of a password's hash, never the password.

IMPORTANT
Because only you hold the key, nobody can reset your master password. Keep your recovery key safe.

Privacy policy: https://kitelux.com/vault/privacy/
```

**Screenshot ideas** (phone, at least 2, aim for 6–8; no real passwords, use demo data):

1. Vault list with folders and the + button — caption "Everything in one private place".
2. Unlock screen with fingerprint — "Unlock with your fingerprint".
3. Autofill drop-down on a sign-in page in Chrome — "Fill logins in apps and websites".
4. Strong-password sheet on a sign-up page — "Strong passwords, suggested for you".
5. Generator screen — "Create strong passwords".
6. Entry detail with 2FA code — "Two-factor codes built in".
7. Settings / encryption note — "No servers. No tracking."
8. Recovery key PDF — "Never get locked out".

Needed images: icon 512×512 PNG, feature graphic 1024×500 (kite logo on the dark brand colour, the
words "Offline. Encrypted. Yours."), see `RELEASE_POLISH.md` section 1.

## 4. Data safety form and content rating

### Data safety (App content → Data safety)

Facts from the code: the vault is encrypted on the device; the only network uses are the optional Drive
backup and the optional breach check. No third-party SDKs for ads or analytics.

| Question                                                                              | Answer                                                                                                                                                      | Why                                                                                                          |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Does the app collect or share required user data types?                               | **Yes** (see below). Optional-only collection is still declared                                                                                             | Backup and breach check do leave the device                                                                  |
| Is all data encrypted in transit?                                                     | **Yes**                                                                                                                                                     | Both calls use HTTPS                                                                                         |
| Can users request data deletion?                                                      | **Yes**: delete the backup in the app, remove the app's Drive data, or uninstall                                                                            | Nothing is kept by Kitelux                                                                                   |
| Data shared with third parties                                                        | **None**                                                                                                                                                    | Drive is the user's own storage; Google acts as the user's storage provider, not a recipient we send data to |
| **Files and docs**                                                                    | Collected, **optional**, not shared. Purpose: **App functionality** (backup). Encrypted in transit: yes                                                     | The encrypted vault file in the user's Drive `appdata` folder                                                |
| **Personal info → Email address**                                                     | Declare only if you want to be strictest: collected, optional, not shared, App functionality. The app shows it only in memory and never sends it to Kitelux | Sign-in is handled by Google                                                                                 |
| **Passwords** (partial hash)                                                          | Breach check: declare **Other** user content or "Other info" as optional, App functionality; only the first 5 characters of a SHA-1 hash leave the device   | Safe-side declaration; the full password never leaves                                                        |
| Location, contacts, messages, photos, health, financial, audio, device IDs, analytics | **Not collected**                                                                                                                                           | Camera frames are processed on the device and never stored or sent                                           |

If Play's review disagrees with a declaration, it tells you what to change. Over-declaring is safe;
under-declaring is not.

### Content rating (App content → Content rating, IARC questionnaire)

Category: **Utility, Productivity, Communication or Other**. Answer **No** to every question: violence,
blood, sexual content, nudity, profanity, drugs/alcohol/tobacco, gambling, scary content, user-generated
content shared with other users, location sharing, digital purchases. The app has no social features and
no purchases. Expected result: **Everyone / PEGI 3 / USK 0**.

### Other App content forms

- Ads: **No ads**.
- Target audience: **18+ (not designed for children)**.
- News app: No. Government app: No. Financial features: None. Health: None.
- App access: **Needs instructions** if reviewers must create a master password — say: "Open the app, create
  a master password (any 12+ characters), skip biometrics." No login to a server exists.
- Advertising ID: **Not used** (the manifest has no `AD_ID` permission).

## 5. Testing tracks and release checklist

### New personal developer accounts

For personal accounts created **after 13 Nov 2023**, Google requires a **closed test with at least 12
testers who stay opted in for 14 continuous days** before you can apply for production access.
Organization accounts (verified with a D-U-N-S number) are exempt.
Source: https://support.google.com/googleplay/android-developer/answer/14151465

Plan around this: the production release cannot happen before about day 15 after the closed test starts.
Also complete identity verification (and a phone check for personal accounts), which can take days.

### Step by step

1. **Account**: pay the one-time fee, verify identity, set up the payments profile (needed even for free apps).
2. **Create the app**: Play Console → Create app → name, default language, App, Free, accept policies.
3. **App content** (all must be green): Privacy policy, Ads, App access, Content rating, Target audience,
   Data safety, Government apps, Financial features, Health. Use section 4.
4. **Store listing**: title, descriptions, icon, feature graphic, screenshots (section 3), category, email.
5. **Build**: `eas build --platform android --profile production`. Wait for the `.aab`.
6. **First upload** to **Internal testing** (draft): upload manually the first time in the console, or run
   `eas submit`. Accept Play App Signing when asked.
7. **SHA-1**: copy the Play app signing SHA-1 and the upload SHA-1 into Google Cloud Android clients (section 1).
   Publish the consent screen.
8. **Internal testing** (up to 100 testers, no review wait): add yourself, install from the opt-in link, run
   the whole of `MANUAL_TEST_PLAN.md`, including 14.11–14.25 (autofill) and backup/restore with the Play-signed
   build. Do not go on if any "Do not release" item fails.
9. **Closed testing**: create a track, add a tester list (Google Group or emails), at least 12 people, and
   share the opt-in link. Keep them opted in for 14 days. Ask them to actually open the app. Collect feedback.
10. **Apply for production access** (Dashboard shows the button after 14 days). Answer the questions: how you
    recruited testers, what feedback you got, what you changed.
11. **Fix and re-test** anything from feedback. Every new upload needs a higher version code (automatic).
12. **Production**: create the release, add release notes, choose countries, use a **staged rollout**
    (for example 20%), then raise it.
13. **After launch**: watch Android vitals (crashes), ratings and reviews. Re-run the checks in
    `SECURITY_REVIEW.md` section 9 for every release.

Review of a first app can take several days, and sensitive permissions or declarations (section 6) can
add time. Do not set a launch date before the review is through.

## 6. What Google may ask: Autofill, Biometrics, permissions

The merged release manifest requests only: `INTERNET`, `ACCESS_NETWORK_STATE`, `CAMERA`, `USE_BIOMETRIC`,
`USE_FINGERPRINT`. The app declares the autofill service with `BIND_AUTOFILL_SERVICE`. It does **not**
request `QUERY_ALL_PACKAGES`, accessibility, SMS, contacts, location, storage, `SYSTEM_ALERT_WINDOW` or
the advertising ID. None of these are Play "restricted" or sensitive-permission declarations, so no special
declaration form should be needed. Be ready to answer in the review notes:

| Topic             | Likely question                      | Answer                                                                                                                                                                                                                                                |
| ----------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autofill service  | Why do you use it, what do you read? | It is the Android Autofill framework (not Accessibility). It reads field hints and the page's origin to find the matching login. It never fills without the user unlocking with the master password or biometrics. No page content leaves the device. |
| Autofill safety   | How do you stop phishing?            | The login is shown only for the exact https site or the exact app package + certificate it was saved for; only trusted browsers are accepted; the unlock screen blocks screenshots and overlay taps.                                                  |
| Biometrics        | What is it for?                      | Optional unlock. The key is held in the Android Keystore and needs the biometric; falling back to the master password always works. Biometric data never reaches the app.                                                                             |
| Camera            | Why?                                 | Scan a two-factor setup QR code. Frames are processed on the device and not stored or sent. Camera is optional and asked only when used.                                                                                                              |
| INTERNET          | Why?                                 | Only for the optional Drive backup and optional breach check.                                                                                                                                                                                         |
| Clipboard         | Why?                                 | The user copies a password; it is cleared automatically.                                                                                                                                                                                              |
| Drive scope       | Why `drive.appdata`?                 | Stores the encrypted vault in a hidden app-only folder. Not restricted, so no security assessment is needed; the Limited Use statement is in the privacy policy.                                                                                      |
| User data         | Is user data sold or shared?         | No. Nothing is collected by Kitelux.                                                                                                                                                                                                                  |
| Encryption export | Export compliance?                   | Uses standard vetted encryption for data protection only.                                                                                                                                                                                             |

Keep the answers short, truthful and consistent with the privacy policy and Data safety form. A mismatch
between the three is the most common reason for rejection.

## 7. Still to do by you

- Publish the OAuth consent screen; add the two missing SHA-1 clients.
- Add the website sentences from section 2.
- Create the Play developer account, complete verification, and start the 12-tester closed test early.
- Run the "Before real users" reviews in `SECURITY_REVIEW.md` section 8 (crypto review, network capture,
  Android pen test) before sharing the app with other people's passwords.
- Run `MANUAL_TEST_PLAN.md` on the Play-signed build.
