# KiteVault

Offline-first, Android-only password manager by Kitelux. Package ID: `com.kitelux.kitevault`.

## Stack

- Expo (managed workflow with development builds, never Expo Go)
- TypeScript, strict mode
- Expo Router
- Zustand
- EAS Build

## Security rules (never break these)

1. Never write custom cryptography. Use vetted libraries only.
2. Never log passwords, keys, vault contents, or decrypted data anywhere (console, crash logs, analytics).
3. No analytics, no tracking, no ads, no network calls except the optional Google Drive backup and the optional breach check.
4. Decrypted vault data lives only in memory and is wiped when the vault locks.
5. Use expo-crypto or the crypto library for all randomness. Never `Math.random()`.
6. The vault is encrypted with AES-256-GCM using a fresh random IV on every save. The master password is turned into a key with Argon2id.
7. Never store the master password, anywhere.
8. Android `allowBackup` must stay `false`.

## Workflow rules

- Work on only the step I give you. Do not add features I did not ask for.
- After each step, run type-check and tests and report the result.
- Keep files small and organized by feature. Add short comments only where the reason is not obvious.
- If something is a security risk or you are unsure, stop and tell me instead of guessing.
- Record important decisions in `docs/DECISIONS.md`.
