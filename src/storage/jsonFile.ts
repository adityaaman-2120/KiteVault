import { File, Paths } from 'expo-file-system';

// For small, NON-SECRET files only (settings, attempt counter). The vault has its own
// crash-safe writer in vaultFile.ts.
//
// A write goes to "<name>.tmp" first and is swapped in with renames, keeping the old file as
// "<name>.bak" for a moment. If the app is killed in the middle, the old or the new content is
// still readable; a file that cannot be read at all reads as null.
const file = (name: string) => new File(Paths.document, name);

function removeQuietly(name: string): void {
  try {
    if (file(name).exists) file(name).delete();
  } catch {
    // Nothing to clean up.
  }
}

async function parse(name: string): Promise<{ value: unknown } | null> {
  try {
    if (!file(name).exists) return null;
    return { value: JSON.parse(await file(name).text()) };
  } catch {
    return null;
  }
}

export async function readJsonFile(name: string): Promise<unknown> {
  const main = await parse(name);
  if (main) return main.value;
  // The write was cut off between "old file moved away" and "new file moved in".
  const backup = await parse(`${name}.bak`);
  return backup ? backup.value : null;
}

export async function writeJsonFile(name: string, value: unknown): Promise<void> {
  const tmp = `${name}.tmp`;
  removeQuietly(tmp);
  file(tmp).create();
  await file(tmp).write(JSON.stringify(value));

  removeQuietly(`${name}.bak`);
  if (file(name).exists) await file(name).move(file(`${name}.bak`));
  await file(tmp).move(file(name));
  removeQuietly(`${name}.bak`);
}

export function deleteJsonFile(name: string): void {
  removeQuietly(`${name}.tmp`);
  removeQuietly(`${name}.bak`);
  removeQuietly(name);
}
