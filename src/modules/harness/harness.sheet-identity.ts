/** Compare a saved job URL with a user's existing tracker rows. */
export function trackerUrlKey(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|fbclid|gclid|msclkid|trk|ref|source)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString();
  } catch { return null; }
}

export function findTrackerUrl(values: unknown, candidate: string): number | null {
  const target = trackerUrlKey(candidate);
  if (!target || !Array.isArray(values)) return null;
  const index = values.findIndex(row => Array.isArray(row) && typeof row[0] === 'string' && trackerUrlKey(row[0]) === target);
  return index < 0 ? null : index + 1;
}
