import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import AppError from '../../errorHelpers/AppError';
import { duplicateReason, hashJob, normalizeJobUrl } from '../job/job.identity';
import { ownerLock, chargeRecommendations } from './career.service';

export const sourceBody = z.object({ provider: z.enum(['LEVER', 'GREENHOUSE']), board: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), company: z.string().min(2).max(160), enabled: z.boolean(),
  policy: z.object({ accessMethod: z.literal('PUBLIC_API'), storageAllowed: z.boolean(), republicationAllowed: z.boolean(), indexingAllowed: z.boolean(), retentionDays: z.number().int().min(1).max(90), attribution: z.string().min(1).max(300), display: z.enum(['FULL', 'SUMMARY', 'LINK_ONLY']), reviewedAt: z.iso.datetime(), reference: z.url() }) });
const lever = z.object({ id: z.string(), text: z.string().min(2), hostedUrl: z.url(), descriptionPlain: z.string().default(''), additionalPlain: z.string().default(''), lists: z.array(z.object({ text: z.string(), content: z.string() })).default([]), categories: z.object({ location: z.string().optional(), commitment: z.string().optional() }).default({}), workplaceType: z.string().optional() });
const greenhouse = z.object({ id: z.number(), title: z.string().min(2), absolute_url: z.url(), content: z.string().default(''), location: z.object({ name: z.string() }), updated_at: z.string().optional() });
const plain = (text: string) => text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
export function normalizePosting(provider: string, value: unknown, company: string) {
  if (provider === 'LEVER') {
    const row = lever.parse(value);
    return { externalId: row.id, title: row.text, company, location: row.categories.location ?? '', description: [row.descriptionPlain, ...row.lists.map(l => `${l.text}: ${plain(l.content)}`), row.additionalPlain].join('\n').trim(), canonicalUrl: normalizeJobUrl(row.hostedUrl)!, workplaceType: row.workplaceType === 'remote' ? 'REMOTE' as const : row.workplaceType === 'hybrid' ? 'HYBRID' as const : 'UNSPECIFIED' as const };
  }
  const row = greenhouse.parse(value);
  return { externalId: String(row.id), title: row.title, company, location: row.location.name, description: plain(row.content), canonicalUrl: normalizeJobUrl(row.absolute_url)!, workplaceType: 'UNSPECIFIED' as const };
}
type Posting = ReturnType<typeof normalizePosting>;
const cache = new Map<string, { expires: number; rows: Posting[] }>();
export async function fetchBoard(id: string) {
  const source = await prisma.careerSource.findUnique({ where: { id } });
  if (!source || !source.enabled) throw new AppError(404, 'Source unavailable or paused.');
  const policy = sourceBody.shape.policy.parse(source.policy);
  if (!policy.storageAllowed || Date.now() - Date.parse(policy.reviewedAt) > 90 * 86400000) throw new AppError(403, 'Source policy needs review.');
  const cached = cache.get(id);
  if (cached && cached.expires > Date.now()) return { source, policy, rows: cached.rows };
  // Claim a crawl budget in the database across processes.
  const claim = await prisma.careerSource.updateMany({ where: { id, enabled: true, OR: [{ nextCheckAt: null }, { nextCheckAt: { lte: new Date() } }] }, data: { nextCheckAt: new Date(Date.now() + 60000) } });
  if (!claim.count) throw new AppError(429, 'This source is cooling down. Try again shortly.');
  const url = source.provider === 'LEVER' ? `https://api.lever.co/v0/postings/${encodeURIComponent(source.board)}?mode=json&limit=100` : `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(source.board)}/jobs?content=true`;
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok || !response.body) throw new Error('Source HTTP failure');
    let size = 0; const chunks: Uint8Array[] = [];
    for await (const chunk of response.body) { size += chunk.length; if (size > 4_000_000) { await response.body.cancel().catch(() => {}); throw new Error('Source response exceeds budget'); } chunks.push(chunk); }
    const json: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const raw = source.provider === 'LEVER' ? z.array(z.unknown()).parse(json) : z.object({ jobs: z.array(z.unknown()) }).parse(json).jobs;
    const rows = raw.slice(0, 100).map(row => normalizePosting(source.provider, row, source.company));
    if (rows.some(r => r.description.length < 20)) throw new Error('Source contract changed');
    cache.set(id, { expires: Date.now() + 60000, rows });
    if (cache.size > 100) cache.delete(cache.keys().next().value!);
    await prisma.careerSource.update({ where: { id }, data: { failures: 0, lastError: null, lastCheckedAt: new Date() } });
    return { source, policy, rows };
  } catch {
    const failures = source.failures + 1;
    await prisma.careerSource.update({ where: { id }, data: { failures, enabled: failures < 3, lastCheckedAt: new Date(), nextCheckAt: new Date(Date.now() + Math.min(3600000, 60000 * 2 ** failures)), lastError: 'Fetch or parser validation failed; review the source contract.' } });
    throw new AppError(503, 'Source temporarily unavailable. Its health status has been updated.');
  }
}
export async function discover(sourceId: string, userId: string) {
  const { source, policy, rows } = await fetchBoard(sourceId);
  const preferences = await prisma.careerPreference.findUnique({ where: { userId } });
  const p = preferences?.preferences as { roles?: string[]; locations?: string[]; workplace?: string } | undefined;
  const ranked = rows.map(row => {
    const why = [ ...(p?.roles?.some(role => row.title.toLowerCase().includes(role.toLowerCase())) ? ['Matches a preferred role'] : []),
      ...(p?.locations?.some(location => row.location.toLowerCase().includes(location.toLowerCase())) ? ['Matches a preferred location'] : []),
      ...(p?.workplace && p.workplace === row.workplaceType ? ['Matches workplace preference'] : []) ];
    return { ...row, why, uncertainty: 'Salary, industry and experience fit need review.' };
  }).sort((a, b) => b.why.length - a.why.length).slice(0, 10);
  if (ranked.length) await chargeRecommendations(userId, sourceId, ranked.map(row => row.externalId));
  return { source: { id: source.id, company: source.company, attribution: policy.attribution }, jobs: ranked.map(row => ({ ...row, description: policy.display === 'LINK_ONLY' ? '' : policy.display === 'SUMMARY' ? row.description.slice(0, 350) : row.description, parseConfidence: 'validated-fields', display: policy.display })) };
}
export async function importPosting(userId: string, sourceId: string, externalId: string) {
  const { source, policy, rows } = await fetchBoard(sourceId);
  const row = rows.find(r => r.externalId === externalId);
  if (!row) throw new AppError(404, 'Posting is no longer in this source response.');
  return prisma.$transaction(async tx => {
    await ownerLock(tx, userId);
    const jobs = await tx.job.findMany({ where: { userId } });
    const prior = await tx.jobSourceListing.findFirst({ where: { sourceName: source.id, externalId, job: { userId } }, include: { job: true } });
    const duplicate = prior?.job ?? jobs.find(job => duplicateReason(job, row));
    const description = policy.display === 'LINK_ONLY' ? 'Open the original listing to review the job description.' : policy.display === 'SUMMARY' ? row.description.slice(0, 350) : row.description;
    const fields = { title: row.title, company: row.company, location: row.location, canonicalUrl: row.canonicalUrl, workplaceType: row.workplaceType };
    const job = duplicate ?? await tx.job.create({ data: { ...fields, description, userId, sourceName: source.company, sourceType: source.provider as 'LEVER' | 'GREENHOUSE', lifecycle: 'ACTIVE', lastVerifiedAt: new Date(), contentHash: hashJob({ ...row, description }), isPrivate: true } });
    await tx.jobSourceListing.upsert({ where: { jobId_sourceName_externalId: { jobId: job.id, sourceName: source.id, externalId } }, create: { jobId: job.id, sourceName: source.id, sourceType: source.provider as 'LEVER' | 'GREENHOUSE', externalId, sourceUrl: row.canonicalUrl, canonicalUrl: row.canonicalUrl, attribution: policy.attribution, lastVerifiedAt: new Date(), rawHash: hashJob(row) }, update: { lastSeenAt: new Date(), lastVerifiedAt: new Date(), rawHash: hashJob(row) } });
    return job;
  });
}
export async function recheckJob(userId: string, jobId: string) {
  const job = await prisma.job.findFirst({ where: { id: jobId, userId }, include: { listings: true } });
  if (!job) throw new AppError(404, 'Job not found.');
  const listing = job.listings.find(l => l.sourceType === 'LEVER' || l.sourceType === 'GREENHOUSE');
  if (!listing) throw new AppError(400, 'This private import must be checked manually at the source.');
  const { rows } = await fetchBoard(listing.sourceName);
  const found = rows.find(r => r.externalId === listing.externalId);
  // Feeds are bounded; absence is not proof of removal.
  return prisma.job.update({ where: { id: jobId }, data: { lifecycle: found ? 'ACTIVE' : 'POSSIBLY_EXPIRED', ...(found ? { lastVerifiedAt: new Date() } : {}) } });
}
