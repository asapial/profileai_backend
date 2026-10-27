export interface ReviewedPolicy {
  source: 'GREENHOUSE' | 'LEVER' | 'ASHBY' | 'REMOTIVE' | 'COMPANY_CAREER' | 'FACEBOOK' | 'LINKEDIN' | 'BDJOBS' | 'MANUAL';
  name: string;
  version: string;
  level: 'A' | 'B' | 'C';
  domains: string[];
  discovery: boolean;
  search: boolean;
  scroll: boolean;
  extraction: boolean;
  formFill: boolean;
  submit: boolean;
  userPresenceRequired: boolean;
  maxPagesPerRun: number;
  maxRequestsPerMinute: number;
  reviewedAt: string;
  reviewReference: string;
  notes: string;
  enabled: boolean;
}

const reviewedAt = '2026-10-01T00:00:00.000Z';

/** Must match profileai_worker/packages/source-policy/src/index.ts. */
export const REVIEWED_POLICIES: readonly ReviewedPolicy[] = [
  {
    source: 'GREENHOUSE',
    name: 'Greenhouse job boards',
    version: 'greenhouse-2026.10',
    level: 'A',
    domains: ['boards.greenhouse.io', 'job-boards.greenhouse.io', 'greenhouse.io'],
    discovery: true,
    search: true,
    scroll: true,
    extraction: true,
    formFill: true,
    submit: true,
    userPresenceRequired: false,
    maxPagesPerRun: 40,
    maxRequestsPerMinute: 20,
    reviewedAt,
    reviewReference: 'SEC-2026-041',
    notes: 'Official job-board pages and public APIs. Never automate authenticated recruiter dashboards.',
    enabled: true,
  },
  {
    source: 'LEVER',
    name: 'Lever job boards',
    version: 'lever-2026.10',
    level: 'A',
    domains: ['jobs.lever.co', 'jobs.eu.lever.co', 'lever.co'],
    discovery: true,
    search: true,
    scroll: true,
    extraction: true,
    formFill: true,
    submit: true,
    userPresenceRequired: false,
    maxPagesPerRun: 40,
    maxRequestsPerMinute: 20,
    reviewedAt,
    reviewReference: 'SEC-2026-042',
    notes: 'Public job-board pages only. Submission stays gated by the run mode and approval policy.',
    enabled: true,
  },
  {
    source: 'ASHBY',
    name: 'Ashby job boards',
    version: 'ashby-2026.10',
    level: 'A',
    domains: ['jobs.ashbyhq.com', 'ashbyhq.com'],
    discovery: true,
    search: true,
    scroll: true,
    extraction: true,
    formFill: true,
    submit: true,
    userPresenceRequired: false,
    maxPagesPerRun: 30,
    maxRequestsPerMinute: 18,
    reviewedAt,
    reviewReference: 'SEC-2026-043',
    notes: 'Public posting pages only. Unknown required questions always stop for review.',
    enabled: true,
  },
  {
    source: 'REMOTIVE',
    name: 'Remotive',
    version: 'remotive-2026.10',
    level: 'A',
    domains: ['remotive.com', 'remotive.io'],
    discovery: true,
    search: true,
    scroll: true,
    extraction: true,
    formFill: false,
    submit: false,
    userPresenceRequired: false,
    maxPagesPerRun: 20,
    maxRequestsPerMinute: 12,
    reviewedAt,
    reviewReference: 'SEC-2026-044',
    notes: 'Discovery and extraction only. Applications continue on the employer page, not on Remotive.',
    enabled: true,
  },
  {
    source: 'COMPANY_CAREER',
    name: 'Company career pages',
    version: 'career-page-2026.10',
    level: 'A',
    domains: ['*'],
    discovery: true,
    search: true,
    scroll: true,
    extraction: true,
    formFill: true,
    submit: false,
    userPresenceRequired: false,
    maxPagesPerRun: 20,
    maxRequestsPerMinute: 10,
    reviewedAt,
    reviewReference: 'SEC-2026-045',
    notes: 'The task allowlist is authoritative. Submit is off by default for unknown career sites.',
    enabled: true,
  },
  {
    source: 'FACEBOOK',
    name: 'Facebook (consent-assisted)',
    version: 'facebook-2026.10',
    level: 'B',
    domains: ['facebook.com', 'www.facebook.com', 'm.facebook.com'],
    discovery: false,
    search: true,
    scroll: true,
    extraction: true,
    formFill: false,
    submit: false,
    userPresenceRequired: true,
    maxPagesPerRun: 5,
    maxRequestsPerMinute: 2,
    reviewedAt,
    reviewReference: 'SEC-2026-046',
    notes: 'Search and scroll only after an explicit per-account consent. Visible browser, no messaging, no pagination beyond the consented page cap, no applications.',
    enabled: true,
  },
  {
    source: 'LINKEDIN',
    name: 'LinkedIn (consent-assisted search)',
    version: 'linkedin-2026.10',
    level: 'C',
    domains: ['linkedin.com', 'www.linkedin.com'],
    discovery: false,
    search: true,
    scroll: true,
    extraction: false,
    formFill: false,
    submit: false,
    userPresenceRequired: true,
    maxPagesPerRun: 3,
    maxRequestsPerMinute: 1,
    reviewedAt,
    reviewReference: 'SEC-2026-047',
    notes: 'Visible job cards may be read during a consented search. No application automation, messaging, profile collection, or form filling; continue on the employer site.',
    enabled: true,
  },
  {
    source: 'BDJOBS',
    name: 'BDJobs (consent-assisted search)',
    version: 'bdjobs-2026.10',
    level: 'B',
    domains: ['bdjobs.com', 'www.bdjobs.com', 'jobs.bdjobs.com'],
    discovery: false,
    search: true,
    scroll: true,
    extraction: true,
    formFill: false,
    submit: false,
    userPresenceRequired: true,
    maxPagesPerRun: 5,
    maxRequestsPerMinute: 2,
    reviewedAt,
    reviewReference: 'SEC-2026-049',
    notes: 'Search and visible listing extraction only after explicit consent. Login, CAPTCHA, OTP, form filling, and submission always require the user.',
    enabled: true,
  },
  {
    source: 'MANUAL',
    name: 'Manual current page',
    version: 'manual-2026.10',
    level: 'C',
    domains: ['*'],
    discovery: false,
    search: false,
    scroll: false,
    extraction: false,
    formFill: false,
    submit: false,
    userPresenceRequired: true,
    maxPagesPerRun: 1,
    maxRequestsPerMinute: 1,
    reviewedAt,
    reviewReference: 'SEC-2026-048',
    notes: 'No automation. Used when a user explicitly wants to save a URL without capture.',
    enabled: true,
  },
];

export function policyForSource(source: string): ReviewedPolicy {
  const policy = REVIEWED_POLICIES.find(item => item.source === source);
  if (!policy) throw new Error(`No reviewed worker policy exists for ${source}.`);
  return policy;
}

export function mapAdapterToSource(adapter: string, explicitSource?: string | null): string {
  if (explicitSource && REVIEWED_POLICIES.some(policy => policy.source === explicitSource)) return explicitSource;
  const normalized = adapter.trim().toUpperCase();
  if (normalized === 'GREENHOUSE' || normalized === 'LEVER' || normalized === 'ASHBY' || normalized === 'REMOTIVE') return normalized;
  if (normalized === 'FACEBOOK') return 'FACEBOOK';
  if (normalized === 'LINKEDIN') return 'LINKEDIN';
  if (normalized === 'BDJOBS') return 'BDJOBS';
  if (normalized === 'MANUAL') return 'MANUAL';
  return 'COMPANY_CAREER';
}

const HOST_SOURCE_RULES: ReadonlyArray<{ readonly source: ReviewedPolicy['source']; readonly domains: readonly string[] }> = [
  { source: 'LINKEDIN', domains: ['linkedin.com'] },
  { source: 'FACEBOOK', domains: ['facebook.com'] },
  { source: 'BDJOBS', domains: ['bdjobs.com'] },
  { source: 'GREENHOUSE', domains: ['greenhouse.io'] },
  { source: 'LEVER', domains: ['lever.co'] },
  { source: 'ASHBY', domains: ['ashbyhq.com'] },
  { source: 'REMOTIVE', domains: ['remotive.com', 'remotive.io'] },
];

const hostMatches = (hostname: string, domain: string): boolean => hostname === domain || hostname.endsWith(`.${domain}`);

/**
 * Classify a task from its actual target URL before trusting adapter labels or
 * stored source hints. A signed task for linkedin.com must never inherit the
 * broader company-career policy just because the adapter was reported as
 * GENERIC. Unknown hosts intentionally fall back to COMPANY_CAREER, whose
 * reviewed policy disables submission.
 */
export function classifyTaskSource(adapter: string, targetUrl?: string | null, explicitSource?: string | null): string {
  let hostname = '';
  try {
    const url = new URL(targetUrl ?? '');
    if (url.protocol === 'http:' || url.protocol === 'https:') hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    hostname = '';
  }
  if (hostname) {
    for (const rule of HOST_SOURCE_RULES) {
      if (rule.domains.some(domain => hostMatches(hostname, domain))) return rule.source;
    }
    // An explicit source is only trusted when the target actually belongs to
    // its reviewed allowlist. Wildcards are not accepted here because this is
    // a security classification, not navigation allowlisting.
    const hinted = explicitSource
      ? REVIEWED_POLICIES.find(policy => policy.source === explicitSource)
      : undefined;
    if (hinted && hinted.domains.some(domain => domain !== '*' && hostMatches(hostname, domain))) return hinted.source;
    return 'COMPANY_CAREER';
  }
  return mapAdapterToSource(adapter, explicitSource);
}

export function mapTaskMode(mode: string): 'RESEARCH' | 'DRAFT' | 'ASSISTED' {
  if (mode === 'RESEARCH') return 'RESEARCH';
  if (mode === 'REVIEW_SUBMIT' || mode === 'ASSISTED') return 'ASSISTED';
  return 'DRAFT';
}

