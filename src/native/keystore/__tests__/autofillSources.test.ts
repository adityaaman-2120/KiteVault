import fs from 'fs';
import path from 'path';

// Rules from CLAUDE.md, checked on the Kotlin source so they cannot be broken by accident:
// no logging of anything, and no network use in the autofill code.
const MAIN = path.join(__dirname, '../android/src/main/java/expo/modules/kitevaultkeystore');

function kotlinFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return kotlinFiles(full);
    return entry.name.endsWith('.kt') ? [full] : [];
  });
}

// Comments may mention these words; only code counts.
const code = (file: string) =>
  fs
    .readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const files = kotlinFiles(MAIN);

test('the Kotlin sources were found', () => {
  expect(files.length).toBeGreaterThan(15);
  expect(files.some((f) => f.endsWith('KiteVaultAutofillService.kt'))).toBe(true);
});

test.each([
  ['android.util.Log', /\bLog\.[a-z]\(/],
  ['println / print', /\bprintln?\(/],
  ['printStackTrace', /printStackTrace/],
  ['Timber', /Timber\./],
])('no source file logs anything (%s)', (_name, pattern) => {
  const offenders = files.filter((f) => pattern.test(code(f))).map((f) => path.basename(f));
  expect(offenders).toEqual([]);
});

test.each([
  ['URL / HttpURLConnection', /\bHttpURLConnection\b|\bURL\(|openConnection/],
  ['sockets', /\bSocket\(|ServerSocket/],
  ['OkHttp / Retrofit', /okhttp3|retrofit2/],
  ['WebView', /\bWebView\b/],
])('the autofill code makes no network calls (%s)', (_name, pattern) => {
  const autofill = files.filter((f) => f.includes(`${path.sep}autofill${path.sep}`));
  expect(autofill.length).toBeGreaterThan(10);
  const offenders = autofill.filter((f) => pattern.test(code(f))).map((f) => path.basename(f));
  expect(offenders).toEqual([]);
});

test('the autofill code never writes to the vault files', () => {
  // Only the pending-save store writes a file, and it is its own encrypted file.
  const autofill = files.filter(
    (f) => f.includes(`${path.sep}autofill${path.sep}`) && !f.endsWith('PendingSaveStore.kt'),
  );
  const offenders = autofill
    .filter((f) =>
      /\.(writeBytes|writeText|delete|renameTo)\(|FileOutputStream|AtomicFile/.test(code(f)),
    )
    .map((f) => path.basename(f));
  expect(offenders).toEqual([]);
});

test('the autofill screen is protected against screenshots and overlay taps', () => {
  const activity = code(path.join(MAIN, 'autofill/AutofillAuthActivity.kt'));
  expect(activity).toContain('FLAG_SECURE');
  expect(activity).toContain('filterTouchesWhenObscured');
});

test('the strong-password screen is protected like the unlock screen', () => {
  const activity = code(path.join(MAIN, 'autofill/AutofillSuggestActivity.kt'));
  expect(activity).toContain('FLAG_SECURE');
  expect(activity).toContain('filterTouchesWhenObscured');
  // It hands Android the new password in exactly one place, and puts nothing else in an intent.
  expect(activity.match(/putExtra\(/g)).toHaveLength(1);
  expect(activity).toContain('EXTRA_AUTHENTICATION_RESULT');
});

test('the "no saved login" screen offers a strong password, only when the origin is known', () => {
  const activity = code(path.join(MAIN, 'autofill/AutofillAuthActivity.kt'));
  expect(activity).toContain('showStrongPassword');
  expect(activity).toContain('PasswordGenerator.generate(');
  // The button is inside a check ...
  expect(activity).toMatch(
    /if \(canSuggest\(request\)\) \{\s*ui\.button\("Suggest a strong password"/,
  );
  // ... that needs a known site or app, a password box, and a page that is not a change-password
  // page or the user-name-only page (the service says so with allowSuggest).
  const canSuggest =
    activity.match(
      /private fun canSuggest[\s\S]*?\n {2}\n|private fun canSuggest[^\n]*\n[^\n]*\n/,
    )?.[0] ?? '';
  expect(canSuggest).toContain('request.allowSuggest');
  expect(canSuggest).toContain('request.passwordId != null');
  expect(canSuggest).toContain('OriginResult.Known');
  // A fingerprint that was cancelled or is not available does not leave the person stuck.
  expect(activity).toContain('showChoice');
  expect(activity).toContain('showProblem');
  // The user-name-only page never fills an empty value.
  expect(activity).toMatch(/request\.passwordId == null && username\.isEmpty\(\)/);
  // The password goes to the boxes through the one place that hands answers to Android.
  expect(activity.match(/Dataset\.Builder\(/g)).toHaveLength(1);
  // A copy waits in the encrypted pending-save file, as for the sheet on marked sign-up pages.
  expect(activity).toContain('SaveCapture.forSuggestion');
});

test('both screens are drawn by the shared sheet, and the security settings stay in the screens', () => {
  for (const name of ['AutofillAuthActivity.kt', 'AutofillSuggestActivity.kt']) {
    const activity = code(path.join(MAIN, 'autofill', name));
    expect(activity).toContain('SheetUi(this)');
    expect(activity).toContain('ui.root.filterTouchesWhenObscured = true');
    expect(activity).toContain('ui.sheet.filterTouchesWhenObscured = true');
    // Neither screen builds its own views any more.
    expect(activity).not.toMatch(/(Button|TextView|EditText|LinearLayout)\(this\)/);
  }
});

test('the sheet draws only: no vault, no files, no intents, no network', () => {
  const ui = code(path.join(MAIN, 'autofill/SheetUi.kt'));
  expect(ui).not.toMatch(
    /VaultReader|VaultKeyUnlocker|Intent\(|putExtra|PendingSaves|filesDir|FillResponse|Dataset/,
  );
});

test('the drop-down suggestions have fixed text and no page content', () => {
  const res = path.join(MAIN, '../../../../res/layout');
  for (const name of [
    'kitevault_autofill_locked_item.xml',
    'kitevault_autofill_suggest_item.xml',
  ]) {
    const xml = fs.readFileSync(path.join(res, name), 'utf8');
    expect(xml).toMatch(/android:text="[^"@]+"/);
    // The only web address allowed is the XML namespace that every Android layout starts with.
    expect(xml.replace('http://schemas.android.com/apk/res/android', '')).not.toMatch(
      /https?:\/\//,
    );
  }
});

test('the strong-password screen makes no use of the vault', () => {
  const activity = code(path.join(MAIN, 'autofill/AutofillSuggestActivity.kt'));
  expect(activity).not.toMatch(/VaultReader|VaultKeyUnlocker|readVaultFile|decrypt\(/);
});

test('random passwords come only from SecureRandom, never from a weaker source', () => {
  const autofill = files.filter((f) => f.includes(`${path.sep}autofill${path.sep}`));
  const offenders = autofill
    .filter((f) =>
      /java\.util\.Random|kotlin\.random|Random\.Default|Math\.random|\.shuffled\(/.test(code(f)),
    )
    .map((f) => path.basename(f));
  expect(offenders).toEqual([]);
  const generator = code(path.join(MAIN, 'autofill/PasswordGenerator.kt'));
  expect(generator).toContain('SecureRandom');
});

test('the service answers with a locked suggestion and never fills by itself', () => {
  const service = code(path.join(MAIN, 'autofill/KiteVaultAutofillService.kt'));
  // The suggestion is a dataset that carries its own unlock step ...
  expect(service).toContain('setAuthentication');
  expect(service).toContain('addDataset');
  // ... with no value in it: every box is set to null, and the service never builds a value.
  expect(service).toMatch(/setValue\(id, null\)/);
  expect(service).not.toContain('AutofillValue');
  expect(service).not.toContain('forText');
  // It is not an authentication for the whole answer, which Chrome shows as a second list item.
  expect(service).not.toMatch(/FillResponse\.Builder\(\)[\s\S]{0,80}\.setAuthentication/);
});

test('the unlock and strong-password screens hand back a dataset, which Android fills at once', () => {
  for (const name of ['AutofillAuthActivity.kt', 'AutofillSuggestActivity.kt']) {
    const activity = code(path.join(MAIN, 'autofill', name));
    expect(activity).toContain('Dataset.Builder()');
    // Not a whole answer: that would be shown as another list item that has to be tapped again.
    expect(activity).not.toContain('FillResponse');
  }
});

test('the pending-save file is separate from the vault and is only written encrypted', () => {
  const store = code(path.join(MAIN, 'autofill/PendingSaveStore.kt'));
  const saves = code(path.join(MAIN, 'autofill/PendingSaves.kt'));
  expect(store + saves).not.toContain('vault.kvlt');
  expect(saves).toContain('kitevault_autofill_pending');
  // the only bytes written are the sealed ones
  expect(store).toContain('sealer.seal(plain)');
  expect(store.match(/writeBytes\(/g)).toHaveLength(1);
});

test('nothing sensitive is put into an intent', () => {
  const service = code(path.join(MAIN, 'autofill/KiteVaultAutofillService.kt'));
  // The only extra the service ever sends is the random one-time ticket of a fill request.
  expect(service.match(/putExtra\(/g)).toHaveLength(1);
  expect(service).toContain('EXTRA_TICKET');
  // The intent that opens KiteVault after a save has no extras at all.
  expect(service).toContain('getLaunchIntentForPackage');
  const activity = code(path.join(MAIN, 'autofill/AutofillAuthActivity.kt'));
  expect(activity.match(/putExtra\(/g)).toHaveLength(1);
  expect(activity).toContain('EXTRA_AUTHENTICATION_RESULT');
});

test('a pending save never prints its contents', () => {
  const model = code(path.join(MAIN, 'autofill/PendingSave.kt'));
  expect(model).toContain('override fun toString() = "PendingSave(${save.kind})"');
});

test('the service never offers a strong password on a change-password page or the user-name page', () => {
  const service = code(path.join(MAIN, 'autofill/KiteVaultAutofillService.kt'));
  expect(service).toContain('FieldClassifier.hasNewPasswordBox');
  expect(service).toMatch(/allowSuggest = false/);
  // The user-name-only page is only used when there is no password box and no save form.
  expect(service).toContain('findUsernameStep');
});

test('the remembered choices (length, symbols) are the only thing the options file keeps', () => {
  const prefs = code(path.join(MAIN, 'autofill/GeneratorPrefs.kt'));
  expect(prefs.match(/putInt\(|putBoolean\(|putString\(/g)).toHaveLength(2);
  expect(prefs).not.toMatch(/putString|"[^"]*(password|host|user|site|account)[^"]*"/i);
});
