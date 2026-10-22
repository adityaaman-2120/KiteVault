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

test('the service answers with a locked suggestion and never fills by itself', () => {
  const service = code(path.join(MAIN, 'autofill/KiteVaultAutofillService.kt'));
  expect(service).toContain('setAuthentication');
  expect(service).not.toContain('addDataset');
  expect(service).not.toContain('AutofillValue');
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
