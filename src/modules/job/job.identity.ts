import { createHash } from 'node:crypto';

export const normalizeText = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

// Preserve identity-bearing query parameters (e.g. gh_jid); discard only tracking.
export function normalizeJobUrl(value?: string | null) {
  if (!value) return null;
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Use an HTTP or HTTPS job URL without credentials.');
  }
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_.+|fbclid|gclid|msclkid)$/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString();
}

type Identity = { title: string; company: string; description: string; location?: string | null | undefined; canonicalUrl?: string | null | undefined };
export const hashJob = (job: Identity) => createHash('sha256').update(
  [job.company, job.title, job.location ?? '', job.description].map(normalizeText).join('\n'),
).digest('hex');

export function duplicateReason(a: Identity, b: Identity): 'url' | 'content' | null {
  // Legacy imports may contain URLs that predate validation.
  try {
    if (a.canonicalUrl && b.canonicalUrl && normalizeJobUrl(a.canonicalUrl) === normalizeJobUrl(b.canonicalUrl)) return 'url';
  } catch { /* Compare content when a legacy URL cannot be normalized. */ }
  return hashJob(a) === hashJob(b) ? 'content' : null;
}

type Lifecycle = 'ACTIVE' | 'POSSIBLY_EXPIRED' | 'EXPIRED' | 'REMOVED' | 'UNKNOWN';
export function jobFreshness(job: { lifecycle: Lifecycle; expiresAt: Date | null; lastVerifiedAt: Date | null }, now = new Date()) {
  if (job.lifecycle === 'REMOVED' || job.lifecycle === 'EXPIRED') return { lifecycle: job.lifecycle, freshness: 'closed' as const };
  if (job.expiresAt && job.expiresAt <= now) return { lifecycle: 'EXPIRED' as const, freshness: 'closed' as const };
  if (!job.lastVerifiedAt) return { lifecycle: job.lifecycle === 'ACTIVE' ? 'UNKNOWN' as const : job.lifecycle, freshness: 'unverified' as const };
  if (now.getTime() - job.lastVerifiedAt.getTime() >= 14 * 86400000) {
    return { lifecycle: job.lifecycle === 'ACTIVE' ? 'POSSIBLY_EXPIRED' as const : job.lifecycle, freshness: 'stale' as const };
  }
  return { lifecycle: job.lifecycle, freshness: 'recent' as const };
}
