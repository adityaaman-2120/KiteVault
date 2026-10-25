# KiteVault

An offline-first password manager for Android, made by Kitelux. Package: `com.kitelux.kitevault`.

Your vault is encrypted on the phone (AES-256-GCM, key from your master password with Argon2id). There is
no account, no server, no analytics and no ads. The only network uses are two optional ones: an encrypted
backup to your own Google Drive, and a breach check that sends only a 5-character hash prefix.

> Status: feature complete, **not yet reviewed by an external security professional**, and not yet tested on
> a range of real phones. Read `docs/SECURITY_REVIEW.md` before trusting it with other people's passwords.

## Stack

Expo (development builds, never Expo Go), React Native, TypeScript (strict), Expo Router, Zustand, EAS Build.
Native Kotlin module for the Android Keystore, biometrics and the Autofill service:
`src/native/keystore/`.

## Run it

```
npm install
npx expo run:android      # builds and installs a development build (needs Android Studio / SDK)
npm start                 # starts Metro for the installed development build
```

Checks (run all of them before a commit):

```
npm run typecheck
npm run lint
npm test
```

Kotlin unit tests need the generated Android project; see `docs/SECURITY_REVIEW.md` section 9.
Delete the generated `android/` folder afterwards. It is not part of the repository.

## Where things are

| Path                   | What                                                            |
| ---------------------- | --------------------------------------------------------------- |
| `src/crypto/`          | Encryption, key derivation, randomness (vetted library only)    |
| `src/vault/`           | Vault format, unlock, recovery key, merge                       |
| `src/storage/`         | The encrypted files on the phone                                |
| `src/features/`        | Screens by feature (entries, autofill, backup, biometric, ...)  |
| `src/native/keystore/` | Kotlin: Keystore, biometrics, Autofill service                  |
| `plugins/`             | Expo config plugins (no backup, autofill, no telemetry, Google) |
| `docs/`                | Decisions, security review, test plans, Play release guide      |

## Rules (full list in `CLAUDE.md`)

No custom cryptography. No logging of secrets. No analytics or tracking. Decrypted data only in memory.
Randomness only from the secure generator. Master password never stored. `allowBackup` stays `false`.

## Releasing

See `RELEASE_CHECKLIST.md` and `docs/PLAY_RELEASE.md`. Decisions and their reasons: `docs/DECISIONS.md`.

## Links

Privacy policy: https://kitelux.com/vault/privacy/ - Terms: https://kitelux.com/vault/terms/
