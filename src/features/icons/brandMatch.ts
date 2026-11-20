import type { AppLink } from '@/vault';

import {
  BRAND_DOMAINS,
  BRAND_NAMES,
  BRAND_PACKAGES,
  BRANDS,
  type BrandInfo,
} from './brandTable.generated';

export type BrandMatch = BrandInfo & { key: string };

// The host of a saved address, lower case: no scheme, user name, port or path ("www." is kept; the
// lookup below also tries every parent, so it does not matter). Null for things that are not hosts.
export function hostOfAddress(address: string): string | null {
  const match = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:[^@/?#]*@)?([^/:?#]+)/i.exec(address.trim());
  const host = match?.[1]?.toLowerCase().replace(/\.$/, '');
  return host && host.includes('.') ? host : null;
}

// "mail.google.com" tries mail.google.com, then google.com. The longest listed name wins, so a
// service with its own address (Gmail) is told apart from its parent (Google).
function brandForHost(host: string): string | undefined {
  const labels = host.split('.');
  for (let i = 0; i < labels.length - 1; i++) {
    const found = BRAND_DOMAINS[labels.slice(i).join('.')];
    if (found) return found;
  }
  return undefined;
}

const plain = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '');

type Matchable = { title: string; urls?: string[]; appLinks?: AppLink[] };

// Which known service an entry is, using only what is on the phone: its web addresses first, then
// the Android apps it is linked to, then an exact title ("GitHub", "netflix"). Null if none, so the
// caller shows a plain tile instead. Nothing is sent anywhere.
export function matchBrand({ title, urls = [], appLinks = [] }: Matchable): BrandMatch | null {
  let key: string | undefined;
  for (const address of urls) {
    const host = hostOfAddress(address);
    key = host ? brandForHost(host) : undefined;
    if (key) break;
  }
  if (!key) key = appLinks.map((link) => BRAND_PACKAGES[link.packageName]).find(Boolean);
  if (!key) {
    // A title that is itself a web address ("netflix.com") counts as an address.
    const host = hostOfAddress(title);
    key = (host && brandForHost(host)) || BRAND_NAMES[plain(title)];
  }
  const info = key ? BRANDS[key] : undefined;
  return key && info ? { key, ...info } : null;
}
