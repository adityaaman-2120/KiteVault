// A short, hand-made list of well-known sites that offer an authenticator app. It is only a hint:
// a site that is not here may still support 2FA, and the list is not updated from the internet.
const DOMAINS = [
  'google.com',
  'gmail.com',
  'youtube.com',
  'microsoft.com',
  'live.com',
  'outlook.com',
  'office.com',
  'apple.com',
  'icloud.com',
  'amazon.com',
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'linkedin.com',
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'atlassian.com',
  'dropbox.com',
  'paypal.com',
  'stripe.com',
  'discord.com',
  'slack.com',
  'reddit.com',
  'twitch.tv',
  'snapchat.com',
  'tiktok.com',
  'coinbase.com',
  'binance.com',
  'kraken.com',
  'cloudflare.com',
  'digitalocean.com',
  'heroku.com',
  'npmjs.com',
  'zoom.us',
  'shopify.com',
  'yahoo.com',
  'ebay.com',
  'proton.me',
  'notion.so',
  'evernote.com',
  'wise.com',
  'robinhood.com',
];

// "https://www.Mail.Google.com:443/x" -> "mail.google.com"
export function hostOf(address: string): string {
  const withoutScheme = address.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  // A backslash is a slash for browsers; an address that uses one to hide the real host is refused.
  if (withoutScheme.includes('\\')) return '';
  const authority = withoutScheme.split(/[/?#]/)[0] ?? '';
  const host = authority.split('@').pop() ?? '';
  return host
    .replace(/:\d+$/, '')
    .toLowerCase()
    .replace(/^www\./, '');
}

export function likelySupports2fa(addresses: readonly string[]): boolean {
  return addresses.some((address) => {
    const host = hostOf(address);
    return DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  });
}
