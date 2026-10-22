# Release polish

What was done for the release, what you still have to prepare, and what could not be checked without a phone.

## 1. Logo, icon and splash screen

### The logo

The KiteVault mark is the **Kitelux kite** (same four-facet diamond, same orange and amber colours, same night-blue `#0E1630`) with a **keyhole cut into the middle** where Kitelux has its sparkle. Kitelux makes the kite; KiteVault locks things up. Anyone who knows the Kitelux logo sees a family member, and nobody mistakes it for the parent. It is plain geometry (no gradients, no effects), drawn from the numbers on the Kitelux logo sheet, and can be edited by hand.

Source and generator: `scripts/build-brand-assets.js` (`npm i --no-save @resvg/resvg-js`, then `node scripts/build-brand-assets.js`). Vector files for designers: `assets/branding/`.

**Name:** "KiteVault" (the word "Vault" is shown in the brand orange where the colour is available), always with "by Kitelux" under it in the app. In the Play Store the developer name carries "Kitelux".

### Images that are already made (in `assets/images/`)

| File                          | Size                                  | What it is                                                                                                                                           |
| ----------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `icon.png`                    | 1024 × 1024, opaque                   | The full-bleed icon on night blue. Source for the Play Store icon.                                                                                   |
| `android-icon-foreground.png` | 1024 × 1024, transparent              | Adaptive icon picture. All of the kite lies inside the centre 676 px circle (Android always keeps that part visible, whatever shape the phone cuts). |
| `android-icon-monochrome.png` | 1024 × 1024, transparent, white shape | "Themed icon" (Android 13+). Only the shape matters; the keyhole is a hole.                                                                          |
| `splash-icon.png`             | 1024 × 1024, transparent              | Start-up picture with the tail. Shown 288 dp wide; Android 12+ draws it inside a circle, so the content stays in the centre two thirds.              |
| `brand-mark.png`              | 512 × 512, transparent                | The mark inside the app (welcome, unlock, about).                                                                                                    |

The adaptive icon background is the plain colour `#0E1630` (`app.json`, `adaptiveIcon.backgroundColor`), so there is no background image. Splash background is the same colour.

### Images you still have to prepare for the store

| What                                   | Exact size                                                      | Notes                                                                                                                  |
| -------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Play Store app icon                    | **512 × 512 px**, PNG, 32-bit, max 1 MB                         | Export `assets/branding/kitevault-icon.svg` at 512 × 512. Do not round the corners: Google does it.                    |
| Feature graphic                        | **1024 × 500 px**, JPEG or 24-bit PNG (no alpha)                | Night blue background, the mark on the left, "KiteVault" and "by Kitelux" on the right. Keep text away from the edges. |
| Phone screenshots                      | 2 to 8, **min 320 px, max 3840 px** per side, ratio at most 2:1 | Use 1080 × 1920. Only fake data. Take them with a debug build, because the release build blocks screenshots.           |
| (Optional) 7" / 10" tablet screenshots | Same rules                                                      | Not needed for a phone-only listing.                                                                                   |

Check before upload: look at the icon on a real phone with round, square and squircle icon shapes, with the themed-icon setting on, and on a light and a dark wallpaper. This could not be done here (no device); the PNGs were only checked by looking at them.

## 2. Accessibility

Done:

- **Screen readers.** Every control has a role and a name. Text boxes are named by their label; the show/hide button on a password box says what it shows ("Show Master password"); check boxes, switches and options announce their state; errors use the `alert` role so they are read out when they appear; the logo picture is hidden from readers and the header reads "KiteVault by Kitelux". Test: `src/components/__tests__/accessibility.test.tsx`.
- **Touch targets.** Everything that can be tapped is at least **48 dp** high (`touch.min` in `src/theme/tokens.ts`); small text actions ("Show", "Copy", "Forgot master password?") use the shared `TextAction`, which is 48 × 48 dp at least.
- **Contrast.** The palette comes from the Kitelux colours. Every text colour on every background it is used on is at least **4.5 : 1**, the edges of text boxes and switches at least **3 : 1**, in both the light and the dark theme. These are checked by a test (`src/theme/__tests__/contrast.test.ts`), so a colour change that breaks them fails the build. Error, warning and success are never told apart by colour alone: each comes with words.
- **Font size.** All text follows the phone's font-size setting. The vault list rows grow with it, up to 1.5 × (`rowHeight()` in `EntryRow.tsx`), so long titles stay readable and the list can still jump to any position.

Not checked (needs a phone and a screen reader): a walk through every screen with TalkBack on; the largest font size and the largest "display size" together; switch access. Please do this once (section 18 of the manual test plan).

## 3. Performance

**What was changed:** the password-strength checker (zxcvbn and its word lists) is now built the first time it is needed instead of when the app starts, so an unlock does not wait for it.

**What could not be measured here:** start-up time and Argon2 time on a mid-range phone. There is no phone in this environment, so any phone number would be a guess. The measurement procedure is below; do it on the slowest phone you support.

### Measure it

1. **Argon2 on this computer (a floor, not the phone):** `node scripts/bench-kdf.js`. On the development computer (Node 24, one thread) the app default of 64 MiB × 3 passes took about 0.5 to 0.8 s, 64 MiB × 2 passes about 0.6 s, 96 MiB × 3 passes about 1.3 s, 128 MiB × 3 passes about 1.7 s. A mid-range phone is usually several times slower than a computer, so expect the default to take roughly **2 to 4 s** there. That is an estimate, not a result.
2. **Unlock time on the phone:** release build, vault with a few hundred entries. With a stopwatch (or a screen recording, 60 fps, counted frame by frame): from pressing "Unlock" to the list appearing. Do five runs and write down the median. Do the same for "Create vault" (it also runs Argon2 once).
3. **Start-up time:** `adb shell am start -W -n com.kitelux.kitevault/.MainActivity` after force-stopping the app (cold start). `TotalTime` is the number to write down. Target: under 2 s on the slowest phone you support, with the splash screen shown the whole time and no white flash.
4. **Memory:** Argon2 at 64 MiB needs 64 MiB at once. On a phone with 3 GB of RAM or less, watch for the app being killed during unlock (`adb logcat -b crash`).

### Targets and tuning

| Unlock time on the slowest supported phone | What to do                                                                                                             |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| under 1.5 s                                | Fine. Could raise passes to 4 or memory to 96 MiB if you want more margin.                                             |
| 1.5 to 3 s                                 | **Keep the default** (64 MiB, 3 passes). This is a normal cost for a password manager.                                 |
| 3 to 5 s                                   | Lower to **64 MiB, 2 passes** (still above the OWASP minimum and above the app's own floor of 19 MiB × 2).             |
| over 5 s, or the app is killed             | Lower memory to **46 MiB, 2 passes**; also look for a slow code path, because the Argon2 library should not need that. |

Notes:

- The cost is stored in each vault's header, so it can be changed later without breaking old vaults. The app does not re-tune old vaults by itself; changing a vault's cost needs a password change that writes new parameters. Do not raise the **floor** (`MIN_MEMORY_KIB`, minimum passes) without a plan for old vaults, and never lower it: it protects a user against a tampered header.
- Never lower the cost for the sake of a benchmark on a fast phone. Choose it for the slowest phone you support and for the attacker's hardware, not for yours.
- One lane (parallelism 1) is deliberate: phones differ a lot in cores, and a single lane gives the same cost everywhere.

## 4. User-facing text

Reviewed every message about the master password, recovery and backup. Changes:

- **Welcome slides.** The master-password slide now says the passwords are gone for good "unless you set up a recovery key" and that Kitelux cannot recover them. The backup slide says the backup is opened only with the master password.
- **Create vault.** The confirmation now reads "I understand that if I forget my master password, nobody can recover my data, not even Kitelux." The intro says there is no reset.
- **Change master password.** Removed the wording about re-wrapping keys. It now says what matters to a user: the passwords stay the same, and **backups already in Google Drive still open with the old master password**. The same sentence is in the confirmation after the change.
- **Erase.** The warning says a backup in Google Drive is not deleted.
- **About / privacy statement.** Was out of date (it said backup and breach check were unavailable). It now says what is true: two optional features use the internet, both off until you turn them on; the breach check sends only the first 5 characters of a password's fingerprint. "No analytics" is a statement about the app's own code and build settings; it still needs the network capture in manual test plan section 16 before you repeat it in the store listing.
- **Storage full / damaged vault.** New messages, see section 5.

Texts that were read and left alone: wrong-password and lock-out messages, recovery key screens, biometric messages, backup error messages (all plain, no internals, no secrets).

## 5. Edge cases

| Situation                                               | What happens now                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Phone storage full while saving**                     | The new version is written to a temporary file first and read back. If that fails, the temporary file is removed and the current vault is untouched. The user sees: "Your phone is out of storage space, so nothing was saved. Free up some space and try again. Your existing passwords are safe." Any other write error gives the general "could not be saved, nothing was changed" message.                                                                                                         |
| **Rename fails half way through a save**                | The previous vault is put back under its name straight away; if even that fails, it is restored at the next start (this was already so).                                                                                                                                                                                                                                                                                                                                                               |
| **App killed during a save**                            | Covered since the first version: at every step either `vault.kvlt` or `vault.kvlt.bak` is a complete vault, and start-up restores it. Tests crash the save after each possible file operation.                                                                                                                                                                                                                                                                                                         |
| **Settings or attempt counter file cut off**            | Small files are now also written to a temporary file and swapped in with renames, with the old one kept until the new one is in place. A file that cannot be read still reads as "not set" (settings go back to defaults). Limit: a lost attempt counter is a lost lock-out delay; an attacker who can kill the app at the exact moment is not stopped by this.                                                                                                                                        |
| **Vault file damaged and no older copy**                | The app does **not** treat this as "no vault": it stays on the unlock screen, so a new vault can never be created over it by accident (tested: creating gives `VAULT_EXISTS`). Unlock says the file is damaged, and the screen offers **Erase damaged vault** (typed confirmation), which leads to the welcome screen with **Restore from Google Drive**. If the user has no backup, the text says the passwords cannot be recovered. We cannot repair an encrypted file: any repair would be a guess. |
| **Backup upload interrupted**                           | The "changed since the last backup" mark used to be cleared before the upload started, so a process killed during an upload lost it and the change was never retried. It is now cleared only after a successful upload, and only if nothing was saved meanwhile. An interrupted upload leaves the older cloud version untouched (Drive keeps the old file until the new upload completes), so there is nothing half-written to restore.                                                                |
| **Backup downloaded for restore is cut off or damaged** | Refused as "damaged or made by a newer version" before anything on the phone is changed (already so).                                                                                                                                                                                                                                                                                                                                                                                                  |

Limits: a full disk can also make _Android_ kill the app or fail to start it, which the app cannot handle. Deleting a file does not overwrite its bytes on flash. No test here can reproduce a real full flash chip; the full-disk case is simulated by making the write fail with the error text Android gives (`ENOSPC`).
