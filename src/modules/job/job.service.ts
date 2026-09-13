import { checkApplicationQuota } from '../career/career.service';
import { duplicateReason, hashJob, jobFreshness, normalizeJobUrl } from './job.identity';
import status from 'http-status';
import { Prisma } from '../../../prisma/generated/prisma/client';
import AppError from '../../errorHelpers/AppError';
import { prisma } from '../../lib/prisma';
import { bustDashboardCache } from '../dashboard/dashboard.service';
import type { CreateJobInput, UpdateJobInput } from './job.schema';

const mapInput = (input: CreateJobInput | UpdateJobInput) => {
  const data: Record<string, unknown> = { ...input };
  if ('canonicalUrl' in input) data.canonicalUrl = normalizeJobUrl(input.canonicalUrl);
  if (input.publishedAt !== undefined) data.publishedAt = new Date(input.publishedAt);
  if (input.expiresAt !== undefined) data.expiresAt = new Date(input.expiresAt);
  if (input.salaryCurrency) data.salaryCurrency = input.salaryCurrency.toUpperCase();
  if (input.salaryMin !== undefined) data.salaryMin = new Prisma.Decimal(input.salaryMin);
  if (input.salaryMax !== undefined) data.salaryMax = new Prisma.Decimal(input.salaryMax);
  return data;
};

export const listJobs = async (userId: string, input: { lifecycle?: string; query?: string; limit?: number }) => {
  await refreshJobLifecycles(userId);
  const take = Math.min(Math.max(input.limit ?? 30, 1), 100);
  const query = input.query?.trim();
  const jobs = await prisma.job.findMany({
    where: {
      userId,
      ...(input.lifecycle ? { lifecycle: input.lifecycle as never } : {}),
      ...(query ? { OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { company: { contains: query, mode: 'insensitive' } },
        { location: { contains: query, mode: 'insensitive' } },
      ] } : {}),
    },
    include: { _count: { select: { applications: true, listings: true } } },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take,
  });
  return jobs.map(job => ({ ...job, ...jobFreshness(job) }));
};

export const getJob = async (userId: string, id: string) => {
  await refreshJobLifecycles(userId);
  const job = await prisma.job.findFirst({
    where: { id, userId },
    include: {
      listings: { orderBy: { lastSeenAt: 'desc' } },
      applications: { select: { id: true, status: true, appliedAt: true }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!job) throw new AppError(status.NOT_FOUND, 'Job not found.');
  return { ...job, ...jobFreshness(job) };
};

// Serialize writes per owner so concurrent imports cannot bypass duplicate checks.
const lockOwner = (tx: Prisma.TransactionClient, userId: string) =>
  tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))::text`;

const assertUnique = async (tx: Prisma.TransactionClient, userId: string, input: CreateJobInput, exceptId?: string) => {
  const candidates = await tx.job.findMany({ where: { userId, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { title: true, company: true, location: true, description: true, canonicalUrl: true } });
  if (candidates.some(candidate => duplicateReason(input, candidate))) {
    throw new AppError(status.CONFLICT, 'This job is already in your workspace. Open the existing job instead.');
  }
};

export const createJob = async (userId: string, input: CreateJobInput) => prisma.$transaction(async tx => {
  await lockOwner(tx, userId);
  await assertUnique(tx, userId, input);
  return tx.job.create({ data: {
    ...mapInput(input), userId, contentHash: hashJob(input),
    sourceType: input.canonicalUrl ? 'USER_URL' : 'MANUAL',
    lifecycle: input.expiresAt && new Date(input.expiresAt) <= new Date() ? 'EXPIRED' : 'UNKNOWN',
    lastVerifiedAt: null,
  } as Prisma.JobUncheckedCreateInput });
});

export const updateJob = async (userId: string, id: string, input: UpdateJobInput) => prisma.$transaction(async tx => {
  await lockOwner(tx, userId);
  const existing = await tx.job.findFirst({ where: { userId, id } });
  if (!existing) throw new AppError(status.NOT_FOUND, 'Job not found.');
  const merged = { ...existing, ...input };
  await assertUnique(tx, userId, merged as unknown as CreateJobInput, id);
  const salaryMin = input.salaryMin ?? (existing.salaryMin === null ? undefined : Number(existing.salaryMin));
  const salaryMax = input.salaryMax ?? (existing.salaryMax === null ? undefined : Number(existing.salaryMax));
  if (salaryMin !== undefined && salaryMax !== undefined && salaryMin > salaryMax) {
    throw new AppError(status.BAD_REQUEST, 'Maximum salary must be greater than minimum salary.');
  }
  return tx.job.update({ where: { id }, data: {
    ...mapInput(input), contentHash: hashJob(merged),
    ...(input.canonicalUrl !== undefined ? { lastVerifiedAt: null, sourceType: input.canonicalUrl ? 'USER_URL' : 'MANUAL' } : {}),
  } as Prisma.JobUpdateInput });
});

// Request-time refresh also works without a running background queue. Never delete history.
async function refreshJobLifecycles(userId: string) {
  const now = new Date();
  await prisma.job.updateMany({ where: { userId, lifecycle: { notIn: ['REMOVED', 'EXPIRED'] }, expiresAt: { lte: now } }, data: { lifecycle: 'EXPIRED' } });
  await prisma.job.updateMany({ where: { userId, lifecycle: 'ACTIVE', lastVerifiedAt: { lt: new Date(now.getTime() - 14 * 86400000) } }, data: { lifecycle: 'POSSIBLY_EXPIRED' } });
  await prisma.job.updateMany({ where: { userId, lifecycle: 'ACTIVE', lastVerifiedAt: null }, data: { lifecycle: 'UNKNOWN' } });
}

export const deleteJob = async (userId: string, id: string) => {
  const existing = await prisma.job.findFirst({ where: { userId, id }, select: { id: true } });
  if (!existing) throw new AppError(status.NOT_FOUND, 'Job not found.');
  await prisma.job.delete({ where: { id } });
  return { id };
};

export const createApplicationFromJob = async (
  userId: string,
  id: string,
  input: { status?: 'SAVED' | 'PREPARING' | 'APPLIED'; resumeId?: string; notes?: string },
) => {
  const job = await prisma.job.findFirst({ where: { id, userId } });
  if (!job) throw new AppError(status.NOT_FOUND, 'Job not found.');
  if (input.resumeId) {
    const resume = await prisma.resume.findFirst({ where: { id: input.resumeId, userId }, select: { id: true } });
    if (!resume) throw new AppError(status.BAD_REQUEST, 'Attached resume not found.');
  }
  const application = await prisma.$transaction(async (tx) => {
    await lockOwner(tx, userId);
    const duplicate = await tx.jobApplication.findFirst({ where: { userId, jobId: id }, select: { id: true } });
    if (duplicate) throw new AppError(status.CONFLICT, 'This job is already in your application tracker.');
    await checkApplicationQuota(tx, userId);
    const row = await tx.jobApplication.create({ data: {
      userId, jobId: id, company: job.company, role: job.title,
      location: job.location, jobUrl: job.canonicalUrl,
      status: input.status ?? 'SAVED',
      ...(input.resumeId ? { resumeId: input.resumeId } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
    } });
    await tx.applicationEvent.create({ data: {
      applicationId: row.id, userId, type: 'CREATED',
      payload: { jobId: job.id, source: job.sourceName, status: row.status } as Prisma.InputJsonValue,
    } });
    return row;
  });
  await bustDashboardCache(userId);
  return application;
};
