# Setting up Google Drive backup (step by step)

KiteVault's cloud backup uses Google Sign-In plus the Google Drive REST API, restricted to **one
permission**: `https://www.googleapis.com/auth/drive.appdata` (a hidden folder only this app can
see). Until you finish this guide the feature stays off: `app.json` ships with
`"enabled": false`, and builds contain no backup screens, no sign-in and no network code path
that can run.

You need: a Google account, the app's package name `com.kitelux.kitevault`, and the SHA-1
fingerprint of **every key the app gets signed with** (step 1). The screens in Google Cloud
Console are renamed from time to time (the OAuth screens are now grouped under "Google Auth
Platform"); the names below are the current ones, and the old names are in brackets.

## 1. Collect your SHA-1 fingerprints

Google checks the app's package name **and** the SHA-1 of the key that signed it. Each different
signing key needs its own entry in step 5. You will usually have three or four:

| Build                                             | Where to find its SHA-1                                                                                                                                                                                         |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local debug build (`npx expo run:android`)        | `"C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -list -v -keystore "%USERPROFILE%\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android` and copy the line `SHA1:` |
| EAS development / preview builds                  | `eas credentials --platform android`, choose the build profile (`development`), then "Keystore", and read **SHA1 Fingerprint**                                                                                  |
| EAS production build (the **upload key**)         | the same command with the `production` profile                                                                                                                                                                  |
| **Play Store installs** (the **app signing key**) | Play Console > your app > Test and release > App integrity > App signing > "App signing key certificate" > SHA-1                                                                                                |

The last row matters most and is the one people forget: once the app is on Google Play with Play
App Signing, Google re-signs it with its own key, so the SHA-1 of the build users actually install
is **not** the one EAS shows. Add it as soon as you have the app in Play Console (an internal
testing track is enough). If sign-in works in your own builds but fails for Play installs, this is
why.

A SHA-1 looks like `A1:B2:C3:...` (20 pairs). Copy it exactly.

## 2. Create the Google Cloud project

1. Open https://console.cloud.google.com and sign in with the Google account that will **own** the
   project (use a team or company account, not a personal one you might lose).
2. Click the project picker at the top, then **New project**.
3. Name: `KiteVault`. Organization/location: as you like. Click **Create**, then select it.

## 3. Turn on the Google Drive API

1. Menu > **APIs & Services** > **Library**.
2. Search `Google Drive API`, open it, click **Enable**.

If you skip this, uploads fail with "accessNotConfigured"; the app shows "not set up correctly
for this build".

## 4. Configure the OAuth consent screen

Menu > **APIs & Services** > **OAuth consent screen** (now **Google Auth Platform**, with tabs
Branding, Audience, Data Access).

1. **Branding**: app name `KiteVault`, a support email, a developer contact email. Add a logo
   later only if you want one (see the verification note at the end: a logo triggers an extra
   check).
2. **Audience**: choose **External**. The project starts in **Testing** mode: only accounts you
   list under **Test users** can sign in (add your own Gmail), and Google signs testers out
   after about **7 days**. Fine for development. For real users you must press **Publish app**
   (step 9).
3. **Data Access** > **Add or remove scopes**: add exactly
   `https://www.googleapis.com/auth/drive.appdata` ("See, create, and delete its own configuration
   data in your Google Drive"). `openid`, `email` and `profile` are included automatically and are
   fine. **Do not add any other Drive scope.**
4. Save.

## 5. Create the Android OAuth client(s)

Menu > **APIs & Services** > **Credentials** > **Create credentials** > **OAuth client ID**.

For **each** SHA-1 from step 1:

1. Application type: **Android**.
2. Name: something that says which key, e.g. `KiteVault debug`, `KiteVault EAS dev`,
   `KiteVault Play signing`.
3. Package name: `com.kitelux.kitevault`
4. SHA-1 certificate fingerprint: paste it.
5. Create.

Several clients with the same package name and different SHA-1s are normal. Nothing from these
clients goes into the app: Google matches the installed app to a client by package name and
signature at run time. It can take a few minutes (rarely longer) for a new client to start working.

## 6. (Only if needed) a Web client ID

KiteVault asks Google only for an access token, which does not need a Web client. If sign-in still
fails with a "DEVELOPER_ERROR" after you are sure the package name and SHA-1 are right, create a
second OAuth client of type **Web application** (no redirect URIs needed), copy its Client ID, and
put it in `app.json` as `"webClientId"` (step 7). I could not test this path on a device, so I
cannot promise which case applies to your setup.

## 7. Switch the feature on in the app

In `app.json`, change the plugin entry:

```json
["./plugins/withGoogleBackup", { "enabled": true, "webClientId": "" }]
```

`webClientId` stays `""` unless step 6 applies. A mistyped Web client ID makes the build fail
immediately with a clear message instead of failing later for the user.

## 8. Build and test

1. Make a new development build (the Google Sign-In library is native code):
   `eas build --profile development --platform android` (or `npx expo run:android`).
2. The build's signing key must be one whose SHA-1 you registered in step 5.
3. Open Settings > Backup > **Turn on cloud backup**, sign in with a Test user, accept the Drive
   permission. The first backup uploads straight away.
4. On the welcome screen of a second phone (or after "Erase vault" / reinstall), tap
   **Restore from Google Drive**.

Common problems:

| Symptom in the app                                                                       | Cause                                                                           |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| "not set up correctly for this build"                                                    | package name or SHA-1 not registered (step 5), or the Drive API is off (step 3) |
| Sign-in works for you but not for Play testers                                           | the Play **app signing key** SHA-1 is missing (step 1, last row)                |
| "Access blocked: has not completed the Google verification process" / "app not verified" | the account is not in the Test users list (step 4.2)                            |
| Signed out after about a week                                                            | project still in Testing mode (step 9)                                          |
| "Google Play services is missing or needs an update"                                     | an emulator without Google Play, or an old Play services                        |

## 9. Going public

Before real users install the app, move the consent screen from Testing to production:
**Audience** > **Publish app**. With only the non-sensitive `drive.appdata` scope (plus the basic
sign-in identity) this normally needs **no** Google review. Check the **Verification Center** page
in the console: it states exactly what, if anything, Google still wants for your project. See the
last section of `docs/DECISIONS.md` ("Cloud backup") for how this scope affects Google
verification and the Play Data Safety form.

## Revoking and cleaning up

- A user can remove KiteVault's access at https://myaccount.google.com/permissions.
- A user can see and delete KiteVault's hidden data in Google Drive: Settings > Manage apps >
  KiteVault > Options > "Delete hidden app data".
- In the app: Settings > Backup > **Delete cloud backup** removes the file; **Sign out** keeps it.
