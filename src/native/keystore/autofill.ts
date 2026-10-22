import { nativeAutofill } from './autofillModule';

export type AutofillStatus = {
  // False when this build or phone has no autofill support at all.
  supported: boolean;
  // True when KiteVault is the autofill service chosen in Android's settings.
  enabled: boolean;
};

const UNSUPPORTED: AutofillStatus = { supported: false, enabled: false };

// Asks Android whether KiteVault is the current autofill service. Never throws.
export function getAutofillStatus(): AutofillStatus {
  try {
    const status = nativeAutofill?.getStatus();
    if (!status) return UNSUPPORTED;
    return { supported: status.supported === true, enabled: status.enabled === true };
  } catch {
    return UNSUPPORTED;
  }
}

// Opens Android's own page where the user picks KiteVault as their autofill service. The choice
// is always made by the user there; KiteVault cannot switch it on by itself.
// Returns false if that page could not be opened.
export function openAutofillSettings(): boolean {
  try {
    return nativeAutofill?.openAutofillSettings() ?? false;
  } catch {
    return false;
  }
}

// --- logins waiting to be saved (after the user agreed to "Save to KiteVault?") ---------------

// Where the login was typed. A web page is identified by its host; an app by its package name and
// the SHA-256 of its signing certificate (the label is only for showing to the user).
export type PendingOrigin =
  | { kind: 'web'; host: string }
  | { kind: 'app'; packageName: string; label: string; certSha256: string };

export type PendingSave = {
  id: string;
  createdAt: number;
  username: string;
  password: string;
  origin: PendingOrigin;
};

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

// Checks one record from the native side. Anything that does not have the expected shape is dropped.
function toPendingSave(raw: unknown): PendingSave | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = text(r.id);
  const password = text(r.password);
  if (!id || !password || typeof r.username !== 'string') return null;
  const createdAt =
    typeof r.createdAt === 'number' && Number.isFinite(r.createdAt) ? r.createdAt : 0;
  if (r.kind === 'WEB') {
    const host = text(r.host);
    return host
      ? { id, createdAt, username: r.username, password, origin: { kind: 'web', host } }
      : null;
  }
  if (r.kind === 'APP') {
    const packageName = text(r.packageName);
    const certSha256 = text(r.certSha256);
    if (!packageName || !certSha256) return null;
    const label = text(r.label) ?? packageName;
    return {
      id,
      createdAt,
      username: r.username,
      password,
      origin: { kind: 'app', packageName, label, certSha256 },
    };
  }
  return null;
}

// The waiting logins, oldest first. Call only while the vault is unlocked. Never throws.
export async function getPendingSaves(): Promise<PendingSave[]> {
  try {
    const list = (await nativeAutofill?.getPendingSaves()) ?? [];
    return list.map(toPendingSave).filter((p): p is PendingSave => p !== null);
  } catch {
    return [];
  }
}

// How many are waiting; none of them is handed out. Never throws.
export async function getPendingSaveCount(): Promise<number> {
  try {
    const count = await nativeAutofill?.getPendingSaveCount();
    return typeof count === 'number' && count > 0 ? count : 0;
  } catch {
    return 0;
  }
}

// Deletes one waiting login. Call it only after it was saved into the vault, or the user said no.
export async function discardPendingSave(id: string): Promise<void> {
  try {
    await nativeAutofill?.discardPendingSave(id);
  } catch {
    // It expires by itself after ten minutes.
  }
}

// Deletes all waiting logins and the key that protected them.
export async function clearPendingSaves(): Promise<void> {
  try {
    await nativeAutofill?.clearPendingSaves();
  } catch {
    // Nothing more can be done from here.
  }
}
