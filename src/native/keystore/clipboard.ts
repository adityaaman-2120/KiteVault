import { requireOptionalNativeModule } from 'expo';

type NativeClipboard = { setSensitiveText(text: string): boolean };

// Null when the native module is not in this build (for example in unit tests).
const native = requireOptionalNativeModule<NativeClipboard>('KitevaultClipboard');

// Puts `text` on the clipboard marked as sensitive, so Android 13+ hides it in the clipboard
// preview. Returns false if that was not possible; the caller then uses the ordinary clipboard.
export function setSensitiveText(text: string): boolean {
  try {
    return native?.setSensitiveText(text) === true;
  } catch {
    return false;
  }
}
