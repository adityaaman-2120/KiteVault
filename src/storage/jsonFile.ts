import { File, Paths } from 'expo-file-system';

// For small, NON-SECRET files only (settings, attempt counter). The vault has its own
// crash-safe writer in vaultFile.ts. A missing or unreadable file reads as null.
export async function readJsonFile(name: string): Promise<unknown> {
  try {
    const file = new File(Paths.document, name);
    if (!file.exists) return null;
    return JSON.parse(await file.text());
  } catch {
    return null;
  }
}

export async function writeJsonFile(name: string, value: unknown): Promise<void> {
  const file = new File(Paths.document, name);
  if (!file.exists) file.create();
  await file.write(JSON.stringify(value));
}

export function deleteJsonFile(name: string): void {
  try {
    const file = new File(Paths.document, name);
    if (file.exists) file.delete();
  } catch {
    // Nothing to clean up.
  }
}
