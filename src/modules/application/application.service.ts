import status from 'http-status';
import { prisma } from '../../lib/prisma';
import { bustDashboardCache } from '../dashboard/dashboard.service';
import AppError from '../../errorHelpers/AppError';
import { CreateApplicationInput, UpdateApplicationInput } from './application.schema';

export interface ListApplicationsInput {
  limit?: number;
  status?: string;
  cursor?: string;
}

const buildCursorWhere = (appliedAt: Date, id: string) => ({
  OR: [
    { appliedAt: { lt: appliedAt } },
    { appliedAt: appliedAt, id: { lt: id } },
  ],
});

export const listApplications = async (userId: string, input: ListApplicationsInput) => {
  const { limit = 20, status: statusFilter, cursor } = input;
  const take = Math.min(Math.max(limit, 1), 100);

  let cursorRecord: { appliedAt: Date; id: string } | null = null;
  if (cursor) {
    cursorRecord = await prisma.jobApplication.findUnique({
      where: { id: cursor },
      select: { appliedAt: true, id: true },
    });
    if (!cursorRecord) {
      throw new AppError(status.BAD_REQUEST, 'Invalid cursor.');
    }
  }

  const items = await prisma.jobApplication.findMany({
    where: {
      userId,
      ...(statusFilter ? { status: statusFilter as 'APPLIED' | 'INTERVIEW' | 'OFFER' | 'REJECTED' | 'WITHDRAWN' } : {}),
      ...(cursorRecord ? buildCursorWhere(cursorRecord.appliedAt, cursorRecord.id) : {}),
    },
    take: take + 1,
    include: { resume: { select: { id: true, title: true } } },
    orderBy: [{ appliedAt: 'desc' }, { id: 'desc' }],
  });

  let nextCursor: string | null = null;
  if (items.length > take) {
    const next = items.pop()!;
    nextCursor = next.id;
  }

  const counts = await prisma.jobApplication.groupBy({
    by: ['status'],
    where: { userId },
    _count: { _all: true },
  });

  return { items, nextCursor, counts };
};

export const getApplication = async (userId: string, id: string) => {
  const item = await prisma.jobApplication.findFirst({
    where: { id, userId },
    include: { resume: { select: { id: true, title: true } } },
  });
  if (!item) throw new AppError(status.NOT_FOUND, 'Application not found.');
  return item;
};

const verifyResumeOwnership = async (userId: string, resumeId: string | undefined | null) => {
  if (!resumeId) return;
  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId } });
  if (!resume) throw new AppError(status.BAD_REQUEST, 'Attached resume not found.');
};

export const createApplication = async (userId: string, input: CreateApplicationInput) => {
  await verifyResumeOwnership(userId, input.resumeId);

  const data: {
    userId: string;
    company: string;
    role: string;
    status?: 'APPLIED' | 'INTERVIEW' | 'OFFER' | 'REJECTED' | 'WITHDRAWN';
    jobUrl?: string | null;
    location?: string;
    appliedAt?: Date;
    notes?: string;
    resumeId?: string | null;
  } = {
    userId,
    company: input.company,
    role: input.role,
  };

  if (input.status) data.status = input.status;
  if (input.jobUrl !== undefined) data.jobUrl = input.jobUrl && input.jobUrl !== '' ? input.jobUrl : null;
  if (input.location) data.location = input.location;
  if (input.appliedAt) data.appliedAt = new Date(input.appliedAt);
  if (input.notes) data.notes = input.notes;
  if (input.resumeId !== undefined) data.resumeId = input.resumeId ?? null;

  const created = await prisma.jobApplication.create({ data });
  await bustDashboardCache(userId);
  return created;
};

export const updateApplication = async (
  userId: string,
  id: string,
  input: UpdateApplicationInput,
) => {
  const existing = await prisma.jobApplication.findFirst({ where: { id, userId } });
  if (!existing) throw new AppError(status.NOT_FOUND, 'Application not found.');

  if (input.resumeId) await verifyResumeOwnership(userId, input.resumeId);

  const data: {
    company?: string;
    role?: string;
    status?: 'APPLIED' | 'INTERVIEW' | 'OFFER' | 'REJECTED' | 'WITHDRAWN';
    jobUrl?: string | null;
    location?: string;
    appliedAt?: Date;
    notes?: string;
    resumeId?: string | null;
  } = {};

  if (input.company !== undefined) data.company = input.company;
  if (input.role !== undefined) data.role = input.role;
  if (input.status !== undefined) data.status = input.status;
  if (input.jobUrl !== undefined) data.jobUrl = input.jobUrl === '' ? null : input.jobUrl;
  if (input.location !== undefined) data.location = input.location;
  if (input.appliedAt !== undefined) data.appliedAt = new Date(input.appliedAt);
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.resumeId !== undefined) data.resumeId = input.resumeId === null ? null : input.resumeId;

  const updated = await prisma.jobApplication.update({ where: { id }, data });
  await bustDashboardCache(userId);
  return updated;
};

export const deleteApplication = async (userId: string, id: string) => {
  const existing = await prisma.jobApplication.findFirst({ where: { id, userId } });
  if (!existing) throw new AppError(status.NOT_FOUND, 'Application not found.');

  await prisma.jobApplication.delete({ where: { id } });
  await bustDashboardCache(userId);
  return { id };
};
