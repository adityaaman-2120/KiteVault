import * as Print from 'expo-print';

import { RECOVERY_GROUPS } from '@/vault';

export const PDF_WARNING =
  'The page contains your recovery key. Anyone who gets it can open your vault. Print it and keep the paper somewhere safe and offline, or save the PDF to a USB drive or other offline storage. Do not save it to cloud storage, do not email or message it, and never take a screenshot or photo of it.';

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The page that is printed or saved as a PDF. It has no scripts and loads nothing from the internet.
export function buildRecoveryHtml(recoveryKey: string, createdAt: number): string {
  const groups = recoveryKey.split('-');
  if (groups.length !== RECOVERY_GROUPS) throw new RangeError('Expected 8 groups.');
  const rows = groups
    .map(
      (group, i) => `<tr><td class="n">${i + 1}</td><td class="g">${escapeHtml(group)}</td></tr>`,
    )
    .join('');
  const date = escapeHtml(new Date(createdAt).toLocaleDateString());

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>KiteVault recovery key</title>
<style>
  body { font-family: sans-serif; margin: 36px; color: #111; }
  h1 { margin: 0 0 4px 0; }
  .warn { border: 3px solid #b3413a; padding: 14px 16px; margin: 20px 0; font-size: 14pt; }
  table { border-collapse: collapse; margin: 16px 0; }
  td { padding: 8px 14px; border: 1px solid #999; }
  td.n { color: #555; width: 30px; text-align: right; }
  td.g { font-family: monospace; font-size: 24pt; letter-spacing: 4px; }
  li { margin-bottom: 6px; }
</style>
</head>
<body>
<h1>KiteVault recovery key</h1>
<p>Created ${date}</p>
<div class="warn"><strong>Anyone who has this key can open your vault.</strong>
Keep this page offline in a safe place, such as a locked drawer or a safe. Do not photograph it,
do not take a screenshot, and do not store it in the cloud, in email or in your password manager.</div>
<table>${rows}</table>
<h2>How to use it</h2>
<ol>
<li>On the KiteVault unlock screen, tap "Forgot master password?".</li>
<li>Type the 8 groups above, then choose a new master password.</li>
</ol>
<p>Capital letters and digits only. The letters I, L, O and U are never used, so if you are unsure
whether you see a letter O or a zero, it is a zero. Spaces and hyphens do not matter.</p>
<p>If you make a new recovery key in the app, this one stops working. Destroy old copies.</p>
</body>
</html>`;
}

// Opens the Android print screen, where the user can print or choose "Save as PDF".
// printAsync is used instead of printToFileAsync on purpose: the latter would leave a PDF with
// the key inside the app's cache folder.
export async function printRecoveryKey(recoveryKey: string, createdAt: number): Promise<void> {
  await Print.printAsync({ html: buildRecoveryHtml(recoveryKey, createdAt) });
}
