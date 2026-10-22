import { isTrashed } from '@/features/entries/model';
import { hostOf } from '@/features/securityCheck/sites2fa';
import type { PendingOrigin } from '@/native/keystore/autofill';
import type { Entry } from '@/vault';

// Accepts "AB:CD:..." or "abcd..." and returns "ABCD..." so two spellings compare equal.
export const normalizeCert = (cert: string): string => cert.replace(/:/g, '').trim().toUpperCase();

// The words shown to the user for "where was this typed?". The app's name comes from the app
// itself, so it is shown together with the package name, which it cannot fake.
export function originText(origin: PendingOrigin): string {
  return origin.kind === 'web' ? origin.host : `${origin.label} (${origin.packageName})`;
}

// The title suggested for a new login; the user can change it.
export function suggestedTitle(origin: PendingOrigin): string {
  return origin.kind === 'web' ? origin.host : origin.label;
}

const sameUser = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Is this entry the login for that place?
//  - a website: one of the entry's saved addresses has exactly this host (ignoring "www." and the
//    scheme, path and port);
//  - an app: the entry is linked to that package with the same signing certificate.
// Deliberately strict, like autofill itself: a login for another subdomain is not "the same".
function isForOrigin(entry: Entry, origin: PendingOrigin): boolean {
  if (origin.kind === 'web') return entry.urls.some((url) => hostOf(url) === origin.host);
  const cert = normalizeCert(origin.certSha256);
  return (entry.appLinks ?? []).some(
    (link) => link.packageName === origin.packageName && normalizeCert(link.certSha256) === cert,
  );
}

// The saved logins that this place + user name already have (newest edit first). Entries in the
// Trash are not counted.
export function findExistingLogins(
  entries: readonly Entry[],
  origin: PendingOrigin,
  username: string,
): Entry[] {
  return entries
    .filter(
      (e) =>
        e.type === 'login' &&
        !isTrashed(e) &&
        sameUser(e.username, username) &&
        isForOrigin(e, origin),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
