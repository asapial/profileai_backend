import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { hashJob, normalizeJobUrl } from '../job/job.identity';

const remotiveJobSchema = z.object({
  id: z.union([z.number(), z.string()]),
  url: z.url(),
  title: z.string().min(1),
  company_name: z.string().min(1),
  candidate_required_location: z.string().default('Worldwide'),
  job_type: z.string().default(''),
  publication_date: z.string(),
  salary: z.string().default(''),
  description: z.string().default(''),
});

const remotiveResponseSchema = z.object({ jobs: z.array(remotiveJobSchema) });

export type RemotiveJob = z.infer<typeof remotiveJobSchema>;

const SEARCH_TERM_FIXES: Record<string, string> = {
  devloper: 'developer', developper: 'developer', enginner: 'engineer', engneer: 'engineer',
  frontent: 'frontend', bakend: 'backend', javasript: 'javascript', typesript: 'typescript',
  javascrpt: 'javascript', rect: 'react', nextjs: 'next.js',
};

export const normalizeJobSearchQuery = (value: string) => value
  .trim()
  .replace(/\b(frontend|backend|fullstack)devloper\b/gi, '$1 developer')
  .split(/\s+/)
  .map(token => SEARCH_TERM_FIXES[token.toLowerCase()] ?? token)
  .join(' ');

// Correct common role typos before a preference version is stored, so every
// future search, sheet row and document keeps the same readable target.
export const normalizeRoleLabel = (value: string) => {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (!trimmed) return trimmed;
  const capitalize = (token: string) => /^[a-z]/.test(token) ? token.charAt(0).toUpperCase() + token.slice(1) : token;
  const fixed = trimmed.replace(/\b(frontend|backend|fullstack)(devloper|developper)\b/gi, (_match, kind: string) => `${kind} developer`);
  return fixed
    .split(' ')
    .map(token => capitalize(SEARCH_TERM_FIXES[token.toLowerCase()] ?? token))
    .join(' ');
};

const plainText = (html: string) => html
  .replace(/<br\s*\/?\s*>/gi, '\n')
  .replace(/<\/p>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&#39;/g, "'")
  .replace(/&quot;/gi, '"')
  .replace(/[ \t]+/g, ' ')
  .replace(/\n\s*\n+/g, '\n')
  .trim();

function employmentType(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z]+/g, '_');
  if (normalized.includes('part')) return 'PART_TIME';
  if (normalized.includes('contract') || normalized.includes('freelance')) return 'CONTRACT';
  if (normalized.includes('intern')) return 'INTERNSHIP';
  return 'FULL_TIME';
}

type PartnerJob = {
  externalId: string;
  title: string;
  company: string;
  description: string;
  location: string;
  workplaceType: 'REMOTE' | 'HYBRID' | 'ON_SITE' | 'UNSPECIFIED';
  employmentType: string;
  canonicalUrl: string;
  sourceName: string;
  sourceType: 'PARTNER_API';
  publishedAt: Date | null;
  contentHash: string;
  attribution: string;
};

function partnerJob(input: Omit<PartnerJob, 'contentHash' | 'sourceType'>): PartnerJob {
  return {
    ...input,
    sourceType: 'PARTNER_API',
    contentHash: createHash('sha256').update(`${input.title}\n${input.company}\n${input.description}`).digest('hex'),
  };
}

export function normalizeRemotiveJob(job: RemotiveJob): PartnerJob {
  const description = plainText(job.description);
  const publishedAt = new Date(job.publication_date);
  return partnerJob({
    externalId: String(job.id),
    title: job.title.trim(),
    company: job.company_name.trim(),
    description,
    location: job.candidate_required_location.trim() || 'Worldwide',
    workplaceType: 'REMOTE',
    employmentType: employmentType(job.job_type),
    canonicalUrl: job.url,
    sourceName: 'Remotive',
    publishedAt: Number.isNaN(publishedAt.getTime()) ? null : publishedAt,
    attribution: 'Job data from Remotive. Open the source URL to apply.',
  });
}

const jobicyJobSchema = z.object({
  id: z.union([z.number(), z.string()]),
  url: z.url(),
  jobTitle: z.string().min(1),
  companyName: z.string().min(1),
  jobGeo: z.string().default('Anywhere'),
  jobType: z.array(z.string()).default([]),
  jobLevel: z.string().default(''),
  jobExcerpt: z.string().default(''),
  jobDescription: z.string().default(''),
  pubDate: z.string().optional(),
});
const jobicyResponseSchema = z.object({ jobs: z.array(jobicyJobSchema).default([]) });

export type JobicyJob = z.infer<typeof jobicyJobSchema>;

export function normalizeJobicyJob(job: JobicyJob): PartnerJob {
  const description = plainText(job.jobDescription || job.jobExcerpt);
  const publishedAt = job.pubDate ? new Date(job.pubDate) : null;
  return partnerJob({
    externalId: String(job.id),
    title: job.jobTitle.trim(),
    company: job.companyName.trim(),
    description,
    location: job.jobGeo.trim() || 'Anywhere',
    workplaceType: 'REMOTE',
    employmentType: employmentType(job.jobType.join(' ')),
    canonicalUrl: job.url,
    sourceName: 'Jobicy',
    publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
    attribution: 'Job data from Jobicy. Open the source URL to apply.',
  });
}

const arbeitnowJobSchema = z.object({
  slug: z.string().min(1),
  company_name: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  remote: z.boolean().default(false),
  url: z.url(),
  tags: z.array(z.string()).default([]),
  job_types: z.array(z.string()).default([]),
  location: z.string().default(''),
  created_at: z.number().optional(),
});
const arbeitnowResponseSchema = z.object({ data: z.array(arbeitnowJobSchema).default([]) });

export type ArbeitnowJob = z.infer<typeof arbeitnowJobSchema>;

export function normalizeArbeitnowJob(job: ArbeitnowJob): PartnerJob {
  const description = plainText(job.description);
  const publishedAt = job.created_at ? new Date(job.created_at * 1000) : null;
  return partnerJob({
    externalId: job.slug,
    title: job.title.trim(),
    company: job.company_name.trim(),
    description,
    location: job.location.trim() || (job.remote ? 'Remote' : 'Unspecified'),
    workplaceType: job.remote ? 'REMOTE' : 'UNSPECIFIED',
    employmentType: employmentType(job.job_types.join(' ')),
    canonicalUrl: job.url,
    sourceName: 'Arbeitnow',
    publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
    attribution: 'Job data from Arbeitnow. Open the source URL to apply.',
  });
}

const queryTokens = (query: string) => [...new Set(normalizeJobSearchQuery(query).toLowerCase().split(/[^a-z0-9+#.]+/).filter(token => token.length >= 3))];

const titleMatchesQuery = (title: string, query: string) => {
  const tokens = queryTokens(query);
  if (!tokens.length) return true;
  const haystack = normalizeJobSearchQuery(title).toLowerCase();
  const matched = tokens.filter(token => haystack.includes(token) || haystack.includes(token.replace(/\./g, '')));
  const occupation = tokens.find(token => ['developer', 'engineer', 'designer', 'manager', 'analyst', 'writer', 'architect', 'consultant'].includes(token));
  return matched.length > 0 && (!occupation || matched.includes(occupation));
};

async function importPartnerListing(userId: string, job: PartnerJob) {
  const prior = await prisma.jobSourceListing.findFirst({ where: { sourceName: job.sourceName, externalId: job.externalId, job: { userId } }, select: { jobId: true } });
  if (prior) {
    await prisma.job.update({
      where: { id: prior.jobId },
      data: {
        title: job.title,
        company: job.company,
        description: job.description,
        location: job.location,
        workplaceType: job.workplaceType,
        employmentType: job.employmentType,
        canonicalUrl: job.canonicalUrl,
        lifecycle: 'ACTIVE',
        lastVerifiedAt: new Date(),
        contentHash: job.contentHash,
      },
    });
    await prisma.jobSourceListing.updateMany({ where: { jobId: prior.jobId, sourceName: job.sourceName, externalId: job.externalId }, data: { sourceUrl: job.canonicalUrl, canonicalUrl: job.canonicalUrl, attribution: job.attribution, publishedAt: job.publishedAt, lastSeenAt: new Date(), lastVerifiedAt: new Date(), rawHash: job.contentHash } });
    return prior.jobId;
  }
  let canonicalUrl: string | null = null;
  try { canonicalUrl = normalizeJobUrl(job.canonicalUrl); } catch { canonicalUrl = null; }
  const duplicate = await prisma.job.findFirst({ where: { userId, OR: [...(canonicalUrl ? [{ canonicalUrl }] : []), { contentHash: hashJob(job) }] }, select: { id: true } });
  if (duplicate) {
    await prisma.job.update({ where: { id: duplicate.id }, data: { lifecycle: 'ACTIVE', lastVerifiedAt: new Date() } });
    await prisma.jobSourceListing.upsert({
      where: { jobId_sourceName_externalId: { jobId: duplicate.id, sourceName: job.sourceName, externalId: job.externalId } },
      create: { jobId: duplicate.id, sourceName: job.sourceName, sourceType: job.sourceType, externalId: job.externalId, sourceUrl: job.canonicalUrl, canonicalUrl: job.canonicalUrl, attribution: job.attribution, publishedAt: job.publishedAt, lastSeenAt: new Date(), lastVerifiedAt: new Date(), rawHash: job.contentHash },
      update: { lastSeenAt: new Date(), lastVerifiedAt: new Date(), canonicalUrl: job.canonicalUrl, sourceUrl: job.canonicalUrl, rawHash: job.contentHash },
    });
    return duplicate.id;
  }
  const created = await prisma.job.create({
    data: {
      userId,
      title: job.title,
      company: job.company,
      description: job.description,
      location: job.location,
      workplaceType: job.workplaceType,
      employmentType: job.employmentType,
      canonicalUrl: job.canonicalUrl,
      sourceName: job.sourceName,
      sourceType: job.sourceType,
      publishedAt: job.publishedAt,
      lastVerifiedAt: new Date(),
      contentHash: job.contentHash,
      listings: { create: { sourceName: job.sourceName, sourceType: job.sourceType, externalId: job.externalId, sourceUrl: job.canonicalUrl, canonicalUrl: job.canonicalUrl, attribution: job.attribution, publishedAt: job.publishedAt, lastSeenAt: new Date(), lastVerifiedAt: new Date(), rawHash: job.contentHash } },
    },
    select: { id: true },
  });
  return created.id;
}

async function importPartnerJobs(userId: string, jobs: PartnerJob[], limit: number, maximumAgeDays: number) {
  const cutoff = Date.now() - maximumAgeDays * 86_400_000;
  const imported: string[] = [];
  for (const job of jobs) {
    if (imported.length >= limit) break;
    if (job.publishedAt && job.publishedAt.getTime() < cutoff) continue;
    if (job.description.length < 20) continue;
    imported.push(await importPartnerListing(userId, job));
  }
  return imported;
}

export async function searchAndImportRemotive(userId: string, query: string, limit: number, maximumAgeDays: number) {
  const url = new URL('https://remotive.com/api/remote-jobs');
  url.searchParams.set('search', normalizeJobSearchQuery(query));
  url.searchParams.set('limit', String(Math.min(Math.max(limit, 1), 50)));
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'ProfileAI/1.0 job-search' }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Remotive search failed with status ${response.status}.`);
  const payload = remotiveResponseSchema.parse(await response.json());
  return importPartnerJobs(userId, payload.jobs.map(normalizeRemotiveJob), limit, maximumAgeDays);
}

export async function searchAndImportJobicy(userId: string, query: string, limit: number, maximumAgeDays: number) {
  const url = new URL('https://jobicy.com/api/v2/remote-jobs');
  url.searchParams.set('count', String(Math.min(Math.max(limit * 3, 20), 50)));
  url.searchParams.set('geo', 'anywhere');
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'ProfileAI/1.0 job-search' }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Jobicy search failed with status ${response.status}.`);
  const payload = jobicyResponseSchema.parse(await response.json());
  const rows = payload.jobs.map(normalizeJobicyJob).filter(job => titleMatchesQuery(job.title, query));
  if (!rows.length) return [] as string[];
  return importPartnerJobs(userId, rows, limit, maximumAgeDays);
}

export async function searchAndImportArbeitnow(userId: string, query: string, limit: number, maximumAgeDays: number) {
  const response = await fetch('https://www.arbeitnow.com/api/job-board-api', { headers: { Accept: 'application/json', 'User-Agent': 'ProfileAI/1.0 job-search' }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Arbeitnow search failed with status ${response.status}.`);
  const payload = arbeitnowResponseSchema.parse(await response.json());
  const rows = payload.data
    .map(normalizeArbeitnowJob)
    .filter(job => titleMatchesQuery(job.title, query))
    .sort((left, right) => (right.publishedAt?.getTime() ?? 0) - (left.publishedAt?.getTime() ?? 0));
  if (!rows.length) return [] as string[];
  return importPartnerJobs(userId, rows, limit, maximumAgeDays);
}

export const jobSearchProviders = [
  { id: 'Remotive', search: searchAndImportRemotive },
  { id: 'Jobicy', search: searchAndImportJobicy },
  { id: 'Arbeitnow', search: searchAndImportArbeitnow },
] as const;
