# Autofill: manual test checklist

Autofill needs a real phone: the system autofill drop-down, the fingerprint dialog and each browser's behaviour cannot be tested on a computer. The automated tests (Kotlin unit tests and Jest) cover the rules; this list covers what only a phone can show.

Please write the result next to each line (OK / FAIL / not applicable) and send me anything that fails, with the phone model and Android version. **Do not paste `adb logcat` or `dumpsys autofill` output without reading it first:** it can contain what was on the screen.

## 0. Before you start

1. Build and install the development build on a phone that has a **fingerprint or face (Class 3) set up**.
2. Create or unlock a vault. In **Settings > Biometric unlock**, turn biometric unlock on (this is required for autofill).
3. Add these logins (use made-up passwords):

   | Title                                | User name  | Web address                                |
   | ------------------------------------ | ---------- | ------------------------------------------ |
   | Demo site                            | `tomsmith` | `https://the-internet.herokuapp.com/login` |
   | Demo site (second account)           | `other`    | `https://the-internet.herokuapp.com`       |
   | Shared ending                        | `shared`   | `https://herokuapp.com`                    |
   | Example                              | `ex`       | `https://example.com`                      |
   | Old login (move to Trash afterwards) | `old`      | `https://the-internet.herokuapp.com/login` |

   The public demo page https://the-internet.herokuapp.com/login accepts user name `tomsmith` and password `SuperSecretPassword!`. Use that password for "Demo site" so a successful login proves the fill worked.

4. Move "Old login" to the **Trash**.
5. In KiteVault go to **Settings > Autofill settings**. Tap **Open Android autofill settings**, choose **KiteVault**, and accept Android's warning. Come back: the screen should say **Ready to fill**.
6. For Chrome: version **135 or newer**. In Chrome open **Settings > Autofill services** and choose **Autofill using another service**, then restart Chrome.

## 1. Settings screen

- [ ] Before choosing KiteVault: "Autofill service: Off", "Not ready yet".
- [ ] The button opens Android's "choose autofill service" page for KiteVault.
- [ ] After choosing it and returning: "On: KiteVault is your autofill service", and "Ready to fill" (when biometric unlock is on).
- [ ] Turn biometric unlock off in Settings: the Autofill screen says "Not ready yet" and tells you why.

## 2. Chrome

Open https://the-internet.herokuapp.com/login in Chrome (normal tab).

- [ ] **A. Locked suggestion.** Tap the user name box. The drop-down shows only **"Unlock KiteVault to fill"**. It shows **no account name, no web address**.
- [ ] **B. Nothing before tapping.** Before you tap the suggestion, both boxes are empty.
- [ ] **C. Fingerprint dialog.** Tap the suggestion. The system dialog says "Fill a login for the-internet.herokuapp.com".
- [ ] **D. Chooser.** Two logins match this site ("Demo site" and the second account), so after the fingerprint a list shows both (title and user name only). Pick "Demo site": the user name and password are filled. Press Log in: it succeeds ("You logged into a secure area!").
- [ ] **E. Cancel.** Repeat A and C, press Cancel in the fingerprint dialog: nothing is filled and nothing crashes.
- [ ] **F. Wrong finger.** Use a finger that is not enrolled a few times, then the right one: the dialog stays open and then works.
- [ ] **G. Only matching fields.** Only the user name and password boxes are filled, nothing else on the page.
- [ ] **H. Trash.** "Old login" (in the Trash) is never offered.
- [ ] **I. Shared ending.** Delete the two "the-internet" logins' web addresses temporarily (keep only the "Shared ending" login for `https://herokuapp.com`). Repeat A and C: you must see **"No saved login for the-internet.herokuapp.com"**, because `herokuapp.com` is a shared ending and must not match its customers' sites. Restore the addresses afterwards.
- [ ] **J. Wrong site.** Open https://example.org/ (or any other login page) with only the "Example" login for `example.com` saved: **"No saved login"**.
- [ ] **K. Search my vault.** On the "No saved login" screen tap **Search my vault**, pick "Example": a warning screen shows both addresses and says they may not be the same. **Cancel** fills nothing. **Fill anyway** fills.
- [ ] **L. http page.** Open an `http://` page with a login form (see section 5). The screen says the page is not using a secure connection and does **not** suggest any login. (Search my vault is still possible, with the warning.)
- [ ] **M. Sign-up form.** On a page that asks you to create a password (hint "new-password"), KiteVault offers **nothing**.
- [ ] **N. Hidden field.** On the hidden-field test page (section 5), only the visible password box is ever filled.
- [ ] **O. Frame from another site.** On the iframe test page (section 5), nothing is filled in the form that comes from the other site.
- [ ] **P. Incognito tab.** Note what happens (offered / not offered). Either is acceptable; tell me which.
- [ ] **Q. Press Home** while the KiteVault card is showing: the card closes, nothing is filled.
- [ ] **R. Screenshot.** Try to take a screenshot while the KiteVault card is showing: blocked or black.

## 3. Another browser (Firefox, or Brave / Edge / Samsung Internet)

Set KiteVault as that browser's autofill service if it has such a setting. Repeat tests A, C, D and J.

- [ ] Works / does not offer KiteVault / offers but nothing matches. (Write which. A browser on the trusted list that does not report the web address simply gets "no match"; it is never filled by guesswork.)

## 4. A normal Android app with a login (for example Reddit, X, Instagram)

The app is **not linked** to any login (unless you saved one from it in section 7), so nothing may match automatically.

- [ ] Tap the user name box: the locked suggestion appears (if the app allows autofill).
- [ ] After the fingerprint: **"No saved login for <app name>"**. Nothing was filled.
- [ ] **Search my vault**, pick any login: the warning names the app, and **Cancel** fills nothing.
- [ ] **Fill anyway** fills only the user name and password boxes.
- [ ] The fingerprint dialog shows the app's name **and its package name** (for example "Reddit (com.reddit.frontpage)").

## 5. A website opened inside another app (the in-app browser)

Send yourself the link https://the-internet.herokuapp.com/login in an app that opens links in its own built-in browser (Telegram, Reddit, Slack, X). Open it there.

- [ ] KiteVault does **not** suggest the "Demo site" login, even though the page is the demo site. (An in-app browser is not on the trusted list, so its web address is ignored: this is the protection against a hostile app showing a fake page.)
- [ ] If the locked suggestion appears, the result is "No saved login for <that app>".
- [ ] Nothing is ever filled into the app's own native boxes.

### Test pages (optional, for tests L, N, O)

Create three small files on your computer and open them from the phone with a local server (for example `python -m http.server 8000` in that folder, then `http://<your computer's IP>:8000/login.html` in Chrome on the phone; the server is plain http, which is exactly test L). Save a login for `http://<your computer's IP>` first.

`login.html`: `<form><input name=u autocomplete=username><input name=p type=password autocomplete=current-password></form>`

`hidden.html`: `<form><input name=u autocomplete=username><input name=p type=password autocomplete=current-password><input name=h type=password style="position:absolute;left:-9999px"></form>`

`signup.html`: `<form><input name=u autocomplete=username><input name=p type=password autocomplete=new-password></form>`

`iframe.html`: `<iframe src="https://the-internet.herokuapp.com/login" width=400 height=400></iframe><form><input name=u autocomplete=username><input name=p type=password></form>` (a page whose own form and a frame from another site are on one screen).

## 6. Limits and security rules

- [ ] **Five fills.** Do five successful fills in a row, then a sixth: the card says **"Unlock KiteVault first"** and asks you to open KiteVault and use the master password. After typing the master password in the app, autofill works again.
- [ ] **Restart.** Restart the phone. The first autofill says to unlock KiteVault first (the same rule as the app's biometric unlock).
- [ ] **New fingerprint.** (Only if you are happy to test it.) Enrol an extra fingerprint in Android. The next autofill says to unlock again in KiteVault, and the Autofill screen shows "Off, because your fingerprints or face changed".
- [ ] **App locked or closed.** Lock KiteVault, then swipe it away from the recent apps. Autofill still works with the fingerprint (it does not depend on the app being open).
- [ ] **Biometric unlock off.** Turn biometric unlock off: the card says to turn it on.
- [ ] **Vault never changed.** After all of the above, open KiteVault and check nothing was added, changed or deleted, and that Backup (if on) did not create a new version only because of autofill.
- [ ] **No secrets in the log.** Run `adb logcat -d` right after a fill and search it for the user name and password you used: neither may appear. (Search; do not paste the log anywhere.)
- [ ] **Not in recent apps.** The KiteVault autofill card does not appear in Android's recent-apps list.

## 7. Saving and updating logins

Saving needs **https** pages and a browser that sends save requests to third-party services. Chrome may not do that yet (see S28); apps usually do. A plain `http://` test page can never be saved, on purpose, so for the page tests below use an https address: publish the snippets from section 5 on GitHub Pages, or run `python -m http.server` and expose it with an https tunnel such as `cloudflared tunnel --url http://localhost:8000` or `ngrok http 8000`. Each snippet needs `action="done.html"` (any second page) on its `<form>` so that submitting it navigates, which is what makes Android ask to save.

Setup: Android autofill service set to KiteVault, and one login "Demo site" saved for your test host with user name `tester` and password `old-password-1`.

**The offer and the hand-over**

- [ ] **S1. New login, web.** In Chrome open your https sign-up page, type user name `newuser` and a password, submit. Android asks **"Save to KiteVault?"** (whether it asks at all is item S28). Tap Save. KiteVault opens by itself (Android 9+). Before you unlock, the **vault has not changed** (check the entry count afterwards).
- [ ] **S2. Unlock first.** If KiteVault was locked, you see the normal unlock screen. After unlocking, the **review screen ("Save to KiteVault?") opens by itself**. It shows the **host in large type**, the user name, and the password hidden until you tap Show.
- [ ] **S3. Edit and choose.** Change the title, pick a folder, tap **Save to KiteVault**. The login appears in the vault list with that title and folder, with the address `https://<host>` and the right password. No duplicate.
- [ ] **S4. Not now.** Repeat S1, tap **Not now**: nothing is saved, and the review screen does not come back.
- [ ] **S5. "No thanks" in Android's own dialog.** Nothing is saved and KiteVault does not open.
- [ ] **S6. Android 8 or 9.** KiteVault does not open by itself after you tap Save. Open it yourself and unlock it: the review screen appears.
- [ ] **S7. Waiting while locked.** Agree to save, then lock KiteVault (or close it) before reviewing. Unlock it within 10 minutes: the review screen appears. Wait **more than 10 minutes** without opening the app: after unlocking, **nothing** is waiting.
- [ ] **S8. Two at once.** Agree to save logins for two different sites within a few minutes. The review screen says "1 more waiting after this one" and shows them one after the other.

**Updating an existing login**

- [ ] **S9. Update.** Sign in (or change the password) on the test site with user name `tester` and a **different** password. The review screen says **"You already have a login for this"**, names "Demo site", and "Update password" is selected. Tap **Update password for "Demo site"**. Open the login: the new password is shown, and **Password history lists `old-password-1`**. The login's "Updated" time changed. Nothing else on it changed (title, folder, notes, address).
- [ ] **S10. Save as new instead.** Choose "Save as new login": a title field appears. After saving there are two logins, and "Demo site" still has `old-password-1`.
- [ ] **S11. Same password.** Submit the form with the password the login already has. The review screen says **"Already saved"** and offers only Done.
- [ ] **S12. Another user name.** Same site, user name `someoneelse`: it is offered as a **new** login, not an update.
- [ ] **S13. In the Trash.** Move "Demo site" to the Trash and repeat S9: it is **not** offered for updating (a new login is offered).
- [ ] **S14. Another site or subdomain.** A login saved for `a.example.com` is not offered for update when you sign in on `b.example.com` or on `example.com`.
- [ ] **S15. Ten old passwords.** Update the same login 11 times (a different password each time): the history keeps the newest 10 old passwords.

**What is saved, and what must not be**

- [ ] **S16. App login.** In a normal app (for example Reddit), sign in by typing the user name and password, and agree to save. The review screen shows **"<app name> (<package name>)"**. Save. The new login has **no web address**. Now sign out of the app and tap its login box: KiteVault offers the login **directly (no "No saved login" screen)**, because the app is now linked to it. An app with a different package name, or a re-signed copy, would not match.
- [ ] **S17. Sign-up with a "confirm password" box.** The offer saves the **new** password. If the two new-password boxes differ, **no offer** appears and nothing is saved.
- [ ] **S18. Nothing typed.** Submit a form with an empty password box: no offer.
- [ ] **S19. http page.** An `http://` page gives **no offer** (or, if Android asks, nothing waits afterwards).
- [ ] **S20. Frame from another site.** On the iframe page from section 5 (served over https), typing in the page's own form and submitting gives no offer while the page also shows a box from another site.
- [ ] **S21. Website inside another app.** Sign in on a website opened in an app's built-in browser (Telegram, Reddit, X). If it is saved at all, the review screen names the **app and its package**, never the website.

**Clean-up and secrets** (use a debug build for the `adb` commands; read any output before sharing it)

- [ ] **S22. Nothing left behind.** While a login is waiting, `adb shell run-as com.kitelux.kitevault ls files` shows `kitevault_autofill_pending.bin`. Look at its bytes (for example `adb shell run-as com.kitelux.kitevault cat files/kitevault_autofill_pending.bin | xxd`): it is unreadable (no password, no user name, no site name). After you tap Save or Not now, or after 10 minutes, the file is **gone**.
- [ ] **S23. The intent has no data.** The screen that opens after "Save" is KiteVault's normal launch screen; nothing about the login is in its address or extras. (`adb shell dumpsys activity recents` shows the recent task's intent without extras. The output can include other apps' details, so do not paste it anywhere.)
- [ ] **S24. No secrets in the log.** After a save, `adb logcat -d`: the password, user name and site must not appear. (Search it; do not paste it.)
- [ ] **S25. Erase.** Agree to save a login, then in KiteVault go to Settings > Erase vault. Create a new vault: **no** review screen appears, and the pending file is gone.
- [ ] **S26. Screenshots.** The review screen cannot be captured (blocked or black), even with "Allow screenshots" on.
- [ ] **S27. Lock during review.** Let the vault auto-lock while the review screen is open: you land on the unlock screen, and after unlocking, the waiting login (if still under 10 minutes) comes back to the review screen. Nothing was saved in between.
- [ ] **S28. Chrome and save.** Write down whether Chrome (135+, "Autofill using another service") asked "Save to KiteVault?" at all. If it does not, saving from Chrome is not available yet and I need to know; saving in apps is unaffected.

## 8. What I could not check without a phone

Whether Chrome and each other browser report the web address and https scheme the way the code expects; the exact behaviour of the authentication `PendingIntent` on every Android version; Android 8 and 9 (where the https scheme is not reported, so browser pages are treated as "not secure"); that apps on Android 11 and newer are visible to the service through the launcher `<queries>` entry (if an app shows no name or "No saved login" even for a linked app, that is the first thing to check); the legacy fingerprint dialog on Android 8 and 9; whether Android shows its save question again for a form that KiteVault itself filled and you then changed; and whether each browser sends save requests at all.
