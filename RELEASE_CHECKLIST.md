# Release checklist

Tick every box for every release. Details: `docs/PLAY_RELEASE.md` (Play), `docs/MANUAL_TEST_PLAN.md`
(phone tests), `docs/SECURITY_REVIEW.md` (risks). Do not ship with an unticked box unless you write down why.

## A. Automated checks (computer)

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes with no warnings
- [ ] `npm test` passes (last run: 1,559 tests, 0 failures)
- [ ] Kotlin tests pass: `npx expo prebuild --platform android --no-install`, then in `android/`
      `gradlew :keystore:testDebugUnitTest`. Then delete `android/`
- [ ] `npm audit`, `npm outdated`, `npx expo-doctor`: nothing new that ships in the app
- [ ] Public Suffix List refreshed (bundled file) and the trusted-browser list reviewed
      (`scripts/make-trusted-browsers.js`, read the diff)
- [ ] `npm run licenses` re-run if dependencies changed
- [ ] No secrets in the repo: no `.jks`, `.p12`, `.env`, service-account JSON, passwords

## B. Configuration

- [ ] `app.json` `version` is right; version code is raised by EAS (`autoIncrement`)
- [ ] `allowBackup` is `false`; the merged release manifest has the data-extraction and full-backup rules
- [ ] Release manifest permissions are only INTERNET, ACCESS_NETWORK_STATE, CAMERA, USE_BIOMETRIC,
      USE_FINGERPRINT (`gradlew :app:processReleaseMainManifest`)
- [ ] Target SDK is 36 or higher (Play rule)
- [ ] `eas.json` production builds an AAB; submit goes to the internal track as a draft

## C. Phone tests (release build, Play-signed for the final run)

- [ ] `docs/MANUAL_TEST_PLAN.md` sections 1-16 on at least two phones (Android 9-11 and 13+)
- [ ] None of the "Do not release" items failed
- [ ] Uninstall/reinstall (section 10): no data comes back
- [ ] Network capture (section 16): only Google (when backup is used) and `api.pwnedpasswords.com`
      (when the breach check is used). QR scanning still works
- [ ] Autofill steps 14.11 - 14.25

## D. Google and Play

- [ ] OAuth consent screen published (not in Testing)
- [ ] Android OAuth clients exist for: EAS production upload key SHA-1 **and** Play app signing SHA-1
- [ ] Backup and restore work on a build installed **from Play** (internal or closed track)
- [ ] Privacy policy and terms pages updated (see `docs/PLAY_RELEASE.md` section 2)
- [ ] Store listing, screenshots, icon, feature graphic uploaded
- [ ] Data safety and content rating forms submitted and match the privacy policy
- [ ] Closed test: 12+ testers for 14 continuous days (personal accounts created after 13 Nov 2023)
- [ ] Production access applied for; release uses a staged rollout

## E. Before anyone else's passwords go in

- [ ] External security review done (list in `docs/SECURITY_REVIEW.md` section 10) and its findings fixed
- [ ] Open findings F-11 to F-13 decided: fixed, or accepted in writing in `docs/DECISIONS.md`
- [ ] The "no analytics" claim confirmed by the network capture (finding F-01)

## F. After release

- [ ] Watch Android vitals (crashes) and reviews for the first week
- [ ] Re-run section A after every dependency update
- [ ] Record any decision in `docs/DECISIONS.md`
