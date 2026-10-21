export function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Adds https:// when the user typed a bare address. Returns null unless the result is a valid
// http(s) URL, so we never hand javascript:, intent: or file: links to the system.
export function toOpenableUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const hasWebScheme = /^https?:\/\//i.test(text);
  // "example.com:8080" or "localhost:3000" is a host and port. Any other "word:" prefix is a
  // scheme (javascript:, intent:, file:, tel:, mailto:, ...) and is refused.
  const looksLikeHostAndPort = /^(localhost|[^:/\s]*\.[^:/\s]*):\d+(\/|$)/i.test(text);
  if (!hasWebScheme && !looksLikeHostAndPort && /^[a-z][a-z0-9+.-]*:/i.test(text)) return null;
  const candidate = hasWebScheme ? text : `https://${text}`;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

// "2 days left", "Today" ... for the trash list.
export function describeDaysLeft(days: number): string {
  if (days <= 0) return 'Deleted today';
  return days === 1 ? '1 day left' : `${days} days left`;
}
