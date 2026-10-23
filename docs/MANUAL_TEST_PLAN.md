# KiteVault manual test plan (real Android phone)

The automated tests (Jest and the Kotlin unit tests) cannot test a phone: the fingerprint sensor, the system autofill, screen capture, the clipboard, a reinstall, a real network, a low battery. This list does. Work through it top to bottom, tick each box, and write down anything that does not match "Expected".

- **Time needed:** about 3 to 4 hours for everything; the first 6 sections (about 1 hour) are the minimum before every release.
- **Companion lists:** autofill details are in `docs/AUTOFILL_TESTING.md` (section 14 here is the short version). What the security review could not check is in `docs/SECURITY_REVIEW.md`, section 8.
- **A failed box is a bug report.** Write: the step number, what you did, what you expected, what happened, phone model, Android version, app build. Never paste real passwords, `adb logcat` or `dumpsys` output without reading it first.

## 0. Before you start

**What you need**

- One phone you can wipe or reinstall on, Android 9 or newer, with a **fingerprint or face (Class 3)** set up. A second phone (or the same phone after a reinstall) for the backup tests. Best: one Android 9 to 11 phone and one Android 13 or newer phone.
- A Google account for **testing** (not your real one) with the Drive backup configured as in `docs/GOOGLE_SETUP.md`, and the release-like build installed (`eas build` APK, or `npx expo run:android --variant release`). Dev builds are fine for most steps, but section 7 (screenshots) and section 15 should also be done on the release build.
- Chrome 135 or newer, and three other apps with a login (for example Reddit, X, Instagram, or a test app of your own).
- A computer with `adb` (optional, marked **(adb)**), a USB cable.

**Test data** (use these made-up values everywhere)

| What                            | Value                                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Master password                 | `Test-Master-Pass-2026!`                                                                                                |
| New master password (section 9) | `Another-Pass-Phrase-2027#`                                                                                             |
| Demo login                      | title `Demo site`, user `tomsmith`, password `SuperSecretPassword!`, address `https://the-internet.herokuapp.com/login` |
| Second entry                    | title `Second`, user `second@example.com`, password from the generator, folder `Work`                                   |
| A note                          | title `Wifi`, note text `router code 12345`                                                                             |

Record: **Phone** ______________ **Android** ______ **App version/build** ______ **Date** ______ **Tester** ______

## 1. Install and first start

- [ ] **1.1** Install the app. Open it. You see the **Welcome** screen (no vault, no login prompt, no crash).
- [ ] **1.2** The system asks for **no permission** at start (no camera, notifications, storage, location).
- [ ] **1.3** Look at the app info in Android settings > Apps > KiteVault > Permissions: nothing is granted. (Camera appears only after you scan a 2FA code.)
- [ ] **1.4** About screen: version number shown, "no analytics" text shown, license list opens. _(Remember: the "no analytics" claim is unproven until the network capture in section 16 is done.)_
- [ ] **1.5** Close the app from recent apps and reopen it: still Welcome.

## 2. Create a vault

- [ ] **2.1** Tap create. A password shorter than 12 characters is refused with a clear message. A weak but long password (`password1234`) is allowed with a warning.
- [ ] **2.2** The two password fields must match; the Show/Hide toggle works; the create button stays off until the "if I forget my master password my data cannot be recovered" box is ticked.
- [ ] **2.3** Create with `Test-Master-Pass-2026!`. A spinner shows while it works (about 1 second). You land in the empty vault list.
- [ ] **2.4** The vault screen is empty with a hint, **Add entry** works.
- [ ] **2.5** Kill the app (swipe from recents). Reopen: you see the **Unlock** screen, not the vault.
- [ ] **2.6** (adb) On a debug build: `adb shell run-as com.kitelux.kitevault ls files` shows `vault.kvlt` and no `.tmp`/`.bak`. `... cat files/vault.kvlt | xxd | head` starts with `KVLT` and contains none of your password.

## 3. Entries, folders, trash, search, generator

- [ ] **3.1** Add `Demo site` (all fields). It appears in the list. Open it: all values correct, password hidden until **Show**.
- [ ] **3.2** Edit it: change the title; save; the change shows. Edit the password: the old one appears in **Password history**.
- [ ] **3.3** Add `Second` with a new folder `Work` (Folders screen), and the note `Wifi`.
- [ ] **3.4** Search for part of a title, a user name and a web address: results narrow correctly; clearing the search brings everything back. Filters (type, favorites, folder) work and can be cleared.
- [ ] **3.5** Mark one entry as a favorite: it moves to the top.
- [ ] **3.6** Move `Wifi` to the **Trash**: it disappears from the list and appears in Trash with "30 days left". **Restore** it. Move it again and **Delete forever**: it is gone for good.
- [ ] **3.7** Generator tab: change the length slider, switch character sets, switch to passphrase mode; each press of generate gives a new value; the strength meter changes; **Use this password** fills an entry form.
- [ ] **3.8** (Optional, debug build) **Seed 2,000** entries: scrolling the list stays smooth; search stays quick (under 1 second); **Remove seed** cleans up.
- [ ] **3.9** Lock the vault (lock button) and unlock again: everything is still there.

## 4. Unlocking, wrong passwords

- [ ] **4.1** Enter a wrong password: a clear "wrong password" message; you stay on the Unlock screen.
- [ ] **4.2** Enter wrong passwords repeatedly: after the first few, a **wait time** appears and grows (see the table in `docs/DECISIONS.md`); during the wait even the **right** password is refused with the time remaining.
- [ ] **4.3** After the wait, the right password unlocks and the failed-attempt count is reset (a later single wrong password does not start a long wait).
- [ ] **4.4** Close the app during a wait and reopen it: the wait is still counted (it does not reset by restarting the app).
- [ ] **4.5** Kill the app while the vault is **unlocked** (swipe from recents), reopen: you see Unlock (data is not kept).

## 5. Auto-lock

Settings > Security > Auto-lock.

- [ ] **5.1** "Lock after leaving the app" = **Immediately**: press Home, come back: Unlock screen.
- [ ] **5.2** Set it to **30 seconds**. Press Home, wait 10 seconds, return: still unlocked. Press Home, wait 40 seconds, return: Unlock.
- [ ] **5.3** Switch to another app and use it for longer than the time: returning shows Unlock (timers are paused in the background; the app compares clock times when it returns).
- [ ] **5.4** "Lock after inactivity" = **1 min**: stay on a vault screen without touching it: after about a minute you land on Unlock. Typing in a field counts as activity (the lock does not fire while you type).
- [ ] **5.5** Lock while an entry is open and while a password is **shown**: after unlocking again, the password is hidden again.
- [ ] **5.6** **Lock now** works immediately.
- [ ] **5.7** (Hard) Change the phone's date back by one hour while the app is in the background and return: the vault is locked (a clock set backwards must not extend the time).

## 6. Biometric unlock

- [ ] **6.1** Settings: turn biometric unlock **on**. The system fingerprint dialog appears. After it, the setting shows "On".
- [ ] **6.2** Lock; on the Unlock screen use the fingerprint: it unlocks. **Use master password** works as an alternative. Cancel leaves you on Unlock.
- [ ] **6.3** Wrong finger several times: the dialog stays open; too many failures blocks biometrics for a while and the app offers the master password.
- [ ] **6.4** **Five-unlock limit.** Unlock with the fingerprint 5 times in a row; the 6th time the app asks for the **master password** and says why. After typing it, fingerprint works again.
- [ ] **6.5** **Restart limit.** With biometrics on, restart the phone. The first unlock needs the master password.
- [ ] **6.6** **Seven-day limit.** (Optional, long) Leave 7 days without typing the master password: biometrics are no longer accepted.
- [ ] **6.7** **New fingerprint.** In Android settings add another fingerprint. Open KiteVault: it says biometrics changed and turned itself **off**; the master password still works; turning it on again works.
- [ ] **6.8** **Remove all fingerprints** in Android settings: KiteVault says no biometrics are set up; master password works.
- [ ] **6.9** Turn biometric unlock **off** in KiteVault: the Unlock screen no longer offers it. (adb, debug build) `ls files` no longer shows `kitevault_biometric_blob.bin`.
- [ ] **6.10** Change the phone's screen lock (PIN to pattern): KiteVault still works with its master password; biometric behaviour as expected (note what happens).

## 7. Screenshots and recent apps

Do this on a **release** build.

- [ ] **7.1** On the Unlock screen, try a screenshot (power + volume down): it is **blocked** ("can't take screenshot") or black.
- [ ] **7.2** Inside the unlocked vault, entry detail with the password shown: screenshot blocked.
- [ ] **7.3** Open the **recent apps** screen: KiteVault's thumbnail is blank/hidden.
- [ ] **7.4** Start screen recording (Quick Settings) and open KiteVault: the app area is black in the recording, or recording refuses.
- [ ] **7.5** Cast/mirror the screen (if you can) and open KiteVault: protected.
- [ ] **7.6** Settings > Privacy > **Allow screenshots** ON: screenshots work inside the vault but **still not** on Unlock/Create screens, the recovery key screen, the review-save screen and the 2FA setup screen. Turn it OFF again afterwards.
- [ ] **7.7** The very first moment: kill the app, reopen it and take a screenshot as early as you can during start-up: blocked.

## 8. Clipboard

- [ ] **8.1** On an entry, copy the **password**. A toast says "Copied, clears in 30 s".
- [ ] **8.2** Paste into another app within 30 seconds: the password pastes. After 30 seconds (with KiteVault in the foreground), paste again: the clipboard is **empty**.
- [ ] **8.3** Copy the password, then copy **something else** (text from another app) before the 30 seconds end: after 30 seconds your other text is **still there** (KiteVault must not wipe what it did not put there).
- [ ] **8.4** Copy the password, go to another app and stay there past 30 seconds, come back to KiteVault: the clipboard is cleared when the app is in front again. (Android does not let a background app read the clipboard; this is the documented limit.)
- [ ] **8.5** Change the setting to 15 s, 60 s and **Never**: the toast text and the behaviour follow.
- [ ] **8.6** On Android 13 or newer: after copying, look at the clipboard bubble above the keyboard / bottom-left: the text should be **hidden** (shown as dots or "sensitive content"). Also open the keyboard's clipboard history (Gboard): note whether the password is stored there.
- [ ] **8.7** Copy a 2FA code (tap the code): same behaviour as passwords.
- [ ] **8.8** Close the app right after copying: the password stays on the clipboard (documented limit: nothing is left running to clear it). Note it.

## 9. Change master password and recovery key

- [ ] **9.1** Settings > Change master password: a wrong current password is refused; mismatched new passwords refused; a weak new password shows the warning.
- [ ] **9.2** Change to `Another-Pass-Phrase-2027#`. All entries are still there. Lock and unlock with the **new** password; the **old** one is refused.
- [ ] **9.3** If biometric unlock was on, it still works after the change (the vault key did not change).
- [ ] **9.4** Create a **recovery key**: the warning "anyone with the recovery key can open your vault" is shown; the key is shown in 8 groups; the print/PDF option opens the Android print dialog (and no PDF is left in Downloads); screenshots of the key screen are blocked even with "Allow screenshots" on.
- [ ] **9.5** Lock. On Unlock tap **Forgot master password?**, enter the key (try typing it with spaces/lower case), set a new master password: you are unlocked with all entries. A wrong key is refused clearly.
- [ ] **9.6** After a successful recovery the **same** recovery key still works (it stays valid until you make a new one). Make a **new** recovery key: the old one then stops working (try it on the Unlock screen: refused).

## 10. Reinstall and erase (data must be gone)

- [ ] **10.1** With a vault containing entries and biometric unlock **on**, uninstall KiteVault (Android settings or long-press > Uninstall).
- [ ] **10.2** Reinstall the same build. Open it: **Welcome** screen. No vault, no entries, no settings carried over (clipboard setting back to 30 s, auto-lock back to defaults, Allow screenshots off).
- [ ] **10.3** Android's own "restore apps and data" must **not** bring anything back. (If you reinstall from the Play Store on a phone with Google backup on, confirm again.)
- [ ] **10.4** Create a new vault with the same master password: it is empty; the old entries are not there.
- [ ] **10.5** Biometric unlock is **off** after the reinstall and has to be turned on again.
- [ ] **10.6** The autofill service choice is cleared by Android after the reinstall (you have to pick KiteVault again in Settings > Autofill).
- [ ] **10.7** (adb, debug build) `adb shell run-as com.kitelux.kitevault ls files` on the fresh install shows no old files.
- [ ] **10.8** **Erase vault** (Settings > Data): the dialog warns clearly; "ERASE" must be typed exactly (lowercase refused); after erasing you are on Welcome; settings are reset; the cloud backup (if any) is **not** deleted (the note says so); a leftover "waiting to be saved" login is gone.
- [ ] **10.9** Erase is cancelled cleanly with Cancel and by pressing Back.

## 11. Google Drive backup and restore

Settings > Encrypted cloud backup. Use the test Google account.

**Turn on and upload**

- [ ] **11.1** **Turn on cloud backup**: the Google sign-in appears, asks **only** for KiteVault's own hidden Drive folder, not for all of Drive. After accepting, "Signed in as …" and a first backup is made.
- [ ] **11.2** In Google Drive (web) > Settings > Manage apps: KiteVault is listed; the backup is **not** visible as a normal file (hidden app data).
- [ ] **11.3** **Back up now** shows the time of the last backup. Make a change, wait about 20 seconds with **automatic backup** on: a new backup is made. Rapid edits give one upload.
- [ ] **11.4** Backup history lists up to 5 versions with phone name and revision; manual backups add versions.

**Restore on a second device (or after a reinstall)**

- [ ] **11.5** On phone B (or after uninstall/reinstall), from the Welcome screen choose **Restore from Google Drive**. Sign in with the same Google account: it finds the backup and shows its date.
- [ ] **11.6** Enter a **wrong** master password: refused (wrong-password wait rules apply). Enter the right one: all entries, folders and history are back. Lock/unlock works.
- [ ] **11.7** The restored phone has backup switched on but **automatic backup off**; turn it on.
- [ ] **11.8** Biometric unlock must be turned on again on the new phone.

**Conflicts and history**

- [ ] **11.9** Edit an entry on phone A and let it back up. Edit a **different** field of the same entry on phone B **without** syncing first, then back up on B: B shows the **conflict screen** and nothing was overwritten.
- [ ] **11.10** Try each choice on separate runs: **Keep this device's version** (new version uploaded, the other one stays in history); **Use cloud version** (asks for the cloud vault's master password, then replaces this phone's vault); **Merge** (lists what happened; nothing deleted; an entry edited on both phones keeps the newest and the older one appears as "(conflicting copy)").
- [ ] **11.11** Delete an entry on A, edit it on B, merge: the edit wins (it stays alive). Edit nothing on B, merge: the entry stays in the Trash, not erased.
- [ ] **11.12** **Backup history > Restore…** on an older version: asks for that version's master password, saves your current state first as a new version, then shows the old data. Restore the newest again to get back.
- [ ] **11.13** Change the master password on A, back up; on B do **Use cloud version**: it needs the **new** password.

**Sign-out, deletion, problems**

- [ ] **11.14** **Delete cloud backup**: the backup disappears from Drive (all versions), automatic backup turns off, the local vault is untouched.
- [ ] **11.15** **Sign out**: settings reset; the cloud backup stays in Drive.
- [ ] **11.16** Remove KiteVault's access in your Google account (myaccount.google.com > Security > Third-party access) and tap Back up now: a clear "access revoked, sign in again" message; no crash.
- [ ] **11.17** The cloud file is encrypted: download it from the debug build or read the bytes: it starts with `KVLT` and has none of your data in the clear.

## 12. Import and export

- [ ] **12.1** Settings > Data > **Export** > **Encrypted backup**: asks for the master password again (wrong refused); the share sheet opens; save the `.kvault` to Files. Open it in another app: unreadable.
- [ ] **12.2** **Plain CSV**: the strong red warning "NOT encrypted" appears; password asked; the share sheet opens; the CSV opens in a spreadsheet and shows your entries readably. **Delete that file now.**
- [ ] **12.3** Cancel the share sheet: no file is left in the app's cache folder (adb, debug build: `ls cache/kitevault-exports` is empty or missing).
- [ ] **12.4** Import: choose a **Chrome passwords CSV** (export one from Chrome > Passwords > Settings > Export, with a few test logins). The preview shows the count and duplicates. Import: entries appear. The "Delete the file now" warning shows, and **Open file manager** opens the Downloads app.
- [ ] **12.5** Import the same file again: all shown as duplicates; "Skip duplicates" on = nothing added; off = added again.
- [ ] **12.6** Import a **Bitwarden JSON** and a **Bitwarden CSV** export: folders, favorites, notes, custom fields and cards come across.
- [ ] **12.7** Import the `.kvault` from 12.1 into a vault with a different master password: it asks for the file's password, previews, and adds entries without replacing existing ones.
- [ ] **12.8** Try importing a photo, a text file and a huge file: each is refused with a clear message and nothing changes. A password-protected Bitwarden export is refused with an explanation.

## 13. Two-factor codes and security check

- [ ] **13.1** Entry > **Add 2FA**: grant the camera, scan a real 2FA QR code (https://rfc6238.dev style test pages, or your test account's 2FA setup). The code appears with a countdown ring and refreshes every 30 seconds. Compare it with a second authenticator app: **identical**, including right at the change.
- [ ] **13.2** Scan a non-2FA QR code (a website): refused with a message, scanning continues. Deny the camera: a message offers typing the secret instead.
- [ ] **13.3** Paste a secret with spaces and lower case: accepted. Paste garbage: refused.
- [ ] **13.4** Tap the code: it is copied (clipboard rules from section 8). The **Authenticator** filter on the vault screen lists entries with codes, each live.
- [ ] **13.5** If the phone's clock is wrong (set it 2 minutes off), the code differs from another authenticator: expected, note it.
- [ ] **13.6** After scanning, the gallery/Files has **no new image** (camera frames are not saved).
- [ ] **13.7** Security check: weak, reused, old, empty-password logins are listed with the right counts; tapping one opens the entry. The score changes after you fix one.
- [ ] **13.8** Breach check: it is **off** by default with an explanation; turning it on shows a button; nothing is sent until you tap it. Tap it (online): a result. With airplane mode on: a clear "no internet" message.

## 14. Autofill (Chrome and three other apps)

Full list: `docs/AUTOFILL_TESTING.md`. Minimum for every release:

- [ ] **14.1** Settings > Autofill: status shows "Off"; the button opens Android's picker; after choosing KiteVault: "On" and "Ready to fill" (biometric unlock must be on).
- [ ] **14.2 Chrome** (135+, "Autofill using another service" turned on): on https://the-internet.herokuapp.com/login tap the user name box: the drop-down shows only **"Unlock KiteVault to fill"**; nothing is filled before you tap it; the fingerprint dialog names the site; the right login fills; pressing Log in succeeds.
- [ ] **14.3 Chrome, wrong site**: with only a login for another site saved, you get "No saved login" and nothing is filled.
- [ ] **14.4 App 1** (a normal app, not linked): "No saved login for <app name>"; **Search my vault** shows a warning with the app's package name; **Cancel** fills nothing; **Fill anyway** fills only the two boxes.
- [ ] **14.5 App 2** (a second app): sign in by typing and agree to **Save to KiteVault?**: KiteVault opens, asks to unlock, shows the review screen with "app name (package)"; Save; next time the login is **offered directly** in that app.
- [ ] **14.6 App 3 / in-app browser**: open a website link inside an app that has its own browser (Telegram, Reddit, X): KiteVault does **not** offer your website's login there.
- [ ] **14.7 Save and update** in Chrome or an app: new login saved with edited title and folder; same user name with a new password gives "Update password" and the old password appears in the entry's history; the same password gives "Already saved".
- [ ] **14.8** A login waiting to be saved disappears after 10 minutes and after Erase vault.
- [ ] **14.9** Five autofills in a row: the sixth says to unlock KiteVault first (master password).
- [ ] **14.10** Autofill on KiteVault's own screens never offers anything (the master password field).
- [ ] **14.11 Strong password, sign-up page** (Chrome, https site with a "new password" box, for example a sign-up form): tapping the password box shows **"Suggest strong password (KiteVault)"** in the drop-down or keyboard strip. Nothing is filled and no password is shown yet. The suggestion does **not** appear on a sign-in page.
- [ ] **14.12** Tap it: a white sheet "Use strong password?" shows a 20-character password and the site's name. **Generate another** gives a different one. **Create my own** closes the sheet and fills nothing. The sheet cannot be screenshotted.
- [ ] **14.13** **Use password** fills the password box **and** the "confirm password" box with the same text, and nothing else (not the e-mail box). Submit the form: Android asks **Save to KiteVault?**; KiteVault opens, asks to unlock, and the review screen has the same password and the user name you typed. Saved once, not twice.
- [ ] **14.14 Not lost:** use a suggested password, then do **not** submit the form (or let the site reject it). Open KiteVault within 10 minutes and unlock: the password is waiting to be saved. After 10 minutes it is gone.
- [ ] **14.14b Unmarked sign-up page** (a page that does not mark its box as a new password, so KiteVault treats it like a sign-in): tap the password box, unlock with the fingerprint: the screen says "No saved login for <site>" and has a **Suggest a strong password** button. It shows the same sheet; **Use password** fills the password box (not the e-mail box); submit and **Save to KiteVault?** keeps it; if you do not submit, it waits 10 minutes in KiteVault as in 14.14.
- [ ] **14.17 Look of the sheet** (do this on the unlock, "No saved login", chooser, search, "fill anyway" warning and the strong-password screens): the sheet is night blue with rounded top corners and slides up; the kite and "KiteVault" are at the top; a pill under them shows the site (green lock for a website, amber lock for an app); buttons are large and easy to hit; text is readable in a bright room; it clears the navigation bar and the keyboard (search); tapping the dimmed area above the sheet closes it and fills nothing; with Android's animations turned off nothing breaks. In the autofill list the row shows the kite, "Unlock KiteVault to fill" and a smaller second line, in both the light and the dark theme of the drop-down.
- [ ] **14.18 Sign-up page that does not mark its boxes, with a "confirm password" box** (two password boxes): tap the password box. **"Suggest strong password"** is offered straight away, with **no** fingerprint. **Use password** fills **both** boxes. It still works with biometric unlock off.
- [ ] **14.19 Sign-up page with one unmarked password box** (no confirm box): it looks like a sign-in, so you get "Unlock KiteVault to fill", then the fingerprint, then "No saved login" with **Suggest a strong password**. Cancel the fingerprint instead: a sheet offers **Use fingerprint** or **Make a strong password** (no dead end).
- [ ] **14.20 Biometric unlock off** on such a page: the message says to turn it on, and **Make a strong password instead** is still there.
- [ ] **14.21 Options:** on the strong-password sheet choose **12**: the password is 12 characters. Turn **Symbols** off: only letters and digits. Close KiteVault's sheet and open it on another site: the last choice is still selected. Neither choice ever puts a site or password in storage.
- [ ] **14.22 Change-password page** (old password, new password, confirm): tap the **old** box: "Unlock KiteVault to fill" and the old password fills (never a strong password there). Tap the **new** box: "Suggest strong password", and both new boxes are filled. After you submit, KiteVault opens and offers **Update password** for your login on that site (one login: offered directly; several: it asks which one you changed).
- [ ] **14.23 Sign-in over two pages** (for example Google or Microsoft): on the user-name page KiteVault offers to fill the **user name only**; on the password page it fills the password. A newsletter or contact form with an e-mail box shows nothing.
- [ ] **14.24 Nothing is guessed from one box:** a normal sign-in page with a single password box still fills the saved login, and never shows "Suggest strong password" first.
- [ ] **14.15** On a plain **http** page, in an in-app browser (14.6) and on a page that mixes sites, no strong-password suggestion appears.
- [ ] **14.16** The suggestion works with biometric unlock **off** (it does not need a fingerprint), and saving the password afterwards still needs the master password.

## 15. Phone conditions

**Low battery / battery saver**

- [ ] **15.1** Turn on **Battery saver** (and, if possible, test below 15 %): the app opens, unlocks, edits and saves normally; automatic backup may be delayed but never fails silently (the "newer changes not uploaded yet" note shows, and **Back up now** works).
- [ ] **15.2** Let the battery drop to the "shutdown" warning (or use an emulator battery setting) while a backup uploads: the vault is not damaged; the next start opens normally (the vault file is saved crash-safely).
- [ ] **15.3** Force-stop the app (Settings > Apps > Force stop) while saving an entry: reopen, unlock: the vault opens with either the old or the new data, never an error.
- [ ] **15.4** Reboot the phone: Unlock screen on first open; biometric unlock needs the master password once (see 6.5).

**No internet**

- [ ] **15.5** Airplane mode: unlock, view, add, edit, copy, generate, lock: everything works (the app is offline-first).
- [ ] **15.6** Airplane mode: Back up now, Restore, Backup history, breach check, sign-in each show a clear "no internet" message; nothing crashes; nothing is half-saved.
- [ ] **15.7** Make a change offline with automatic backup on, then turn the network on and bring the app to the front: the pending upload happens (or Back up now works).
- [ ] **15.8** Turn the network off in the middle of an upload: an error, no damaged cloud backup; the next backup succeeds.
- [ ] **15.9** Poor network (use a throttled hotspot): uploads take longer but succeed or fail cleanly within about 20 seconds per request.

**Rotated screen**

- [ ] **15.10** The app is fixed to **portrait**. Rotate the phone on every main screen (Unlock, vault list, entry, forms, settings, generator): the app stays portrait, keeps what you typed, and does not crash or lock.
- [ ] **15.11** Rotate while the **fingerprint dialog** is open, while the **camera** (2FA scan) is open, and while the **autofill card** is open: no crash; the dialog completes or cancels cleanly; the autofill card keeps working or closes without filling.
- [ ] **15.12** Rotate while typing the master password on Unlock/Create: the text is kept.
- [ ] **15.13** Split-screen / floating window (if the phone supports it): the app is usable or refuses cleanly, and the lock timers still work.

**Dark mode and display**

- [ ] **15.14** Switch Android to **dark mode** (and back) while the app is open: every screen is readable (text vs background, buttons, chips, warnings in red/yellow, the countdown ring, the strength meter, the unlock card of autofill). Take notes of any white-on-white or black-on-black text.
- [ ] **15.15** Set Android **font size to the largest** and **display size to the largest**: text is not cut off, buttons stay reachable, the Create/Unlock forms scroll.
- [ ] **15.16** **TalkBack** on: the main buttons are announced with sensible names; the Show/Hide password buttons say what they do; the countdown ring says seconds left; the strength meter is announced.
- [ ] **15.17** **Bold text / high contrast text**, **reduce animations**: nothing breaks.

**Interruptions**

- [ ] **15.18** A phone call or alarm while on an entry: after returning the app is as expected (locked if the time passed).
- [ ] **15.19** Pull down the notification shade on the Unlock screen and the vault: no sensitive text appears in any notification (the app posts none).
- [ ] **15.20** Change the phone language and region: the app does not crash (it is English only; note layout problems).

## 16. Network capture (once per release)

Needed to back the claim "no analytics, no tracking". See `docs/SECURITY_REVIEW.md` F-01.

- [ ] **16.1** Put the phone behind a proxy you control (for example mitmproxy with its certificate installed on a test phone) or use a firewall app that logs connections.
- [ ] **16.2** Use **every feature once**, including QR scanning, without ever using Drive backup or the breach check.
- [ ] **16.3** Expected: **no connection at all** from KiteVault (Google Play services' own traffic is separate; note which package makes each connection).
- [ ] **16.4** Now use the Drive backup and the breach check: connections only to Google sign-in/Drive endpoints and `api.pwnedpasswords.com`, and for the latter only a 5-character hash prefix in the address.
- [ ] **16.5** Any other host (especially `firebaselogging-pa.googleapis.com` or other Google logging hosts) is a **failed release**: report it.

## 18. Release polish checks (on a phone)

- [ ] Icon: looks right with round, square and squircle shapes, with themed icons on, on a light and a dark wallpaper. Name under the icon is "KiteVault".
- [ ] Splash: night-blue screen with the kite, no white flash, on Android 11 and on Android 12 or newer.
- [ ] Welcome, unlock and About show the kite, "KiteVault" and "by Kitelux".
- [ ] TalkBack on: walk through welcome, create vault, unlock, list, an entry, settings. Every control is announced with a name and role; the password box says "Show Master password"; errors are read out.
- [ ] Largest font size and largest display size: nothing is cut off or overlaps; the list still scrolls to the end; every button can be tapped.
- [ ] Unlock time (5 runs, release build, a few hundred entries): ____ s median. Cold start (`am start -W` TotalTime): ____ ms. Decide on Argon2 settings using the table in docs/RELEASE_POLISH.md.
- [ ] Fill the phone's storage, then save an entry: the message says the phone is out of storage space; after freeing space the same change saves, and the vault still unlocks.
- [ ] Turn on airplane mode in the middle of a backup (or kill the app while "backing up"): after reopening, the change is backed up on the next automatic or manual backup.
- [ ] Force-stop the app right after saving an entry (repeat 10 times): the entry is there, or the previous state is, and the vault always unlocks.
- [ ] Damaged vault (debug build only: overwrite the vault file with zeros): unlock says it is damaged, the damaged-vault card is shown, erasing it leads to the welcome screen, and "Restore from Google Drive" brings the backup back.

## 17. Sign-off

| Section                      | Result (pass / fail / skipped) | Notes |
| ---------------------------- | ------------------------------ | ----- |
| 1 Install                    |                                |       |
| 2 Create                     |                                |       |
| 3 Entries                    |                                |       |
| 4 Unlock                     |                                |       |
| 5 Auto-lock                  |                                |       |
| 6 Biometrics                 |                                |       |
| 7 Screenshots                |                                |       |
| 8 Clipboard                  |                                |       |
| 9 Password change / recovery |                                |       |
| 10 Reinstall / erase         |                                |       |
| 11 Drive backup              |                                |       |
| 12 Import / export           |                                |       |
| 13 2FA / security check      |                                |       |
| 14 Autofill                  |                                |       |
| 15 Phone conditions          |                                |       |
| 16 Network capture           |                                |       |

**Do not release** if any of these failed: 2.5, 4.2, 5.2, 6.4, 6.7, 7.1 to 7.3, 10.2, 10.3, 11.6, 11.10, 14.2 to 14.4, 14.13, 14.15, 14.22, 14.24, 15.3, or anything in section 16.
