import * as Print from 'expo-print';

import { buildRecoveryHtml } from './recoveryPdfTemplate';

export { buildRecoveryHtml };

export const PDF_WARNING =
  'The page contains your recovery key. Anyone who gets it can open your vault. Print it and keep the paper somewhere safe and offline, or save the PDF to a USB drive or other offline storage. Do not save it to cloud storage, do not email or message it, and never take a screenshot or photo of it.';

// Opens the Android print screen, where the user can print or choose "Save as PDF".
// printAsync is used instead of printToFileAsync on purpose: the latter would leave a PDF with
// the key inside the app's cache folder.
export async function printRecoveryKey(recoveryKey: string, createdAt: number): Promise<void> {
  await Print.printAsync({ html: buildRecoveryHtml(recoveryKey, createdAt) });
}
