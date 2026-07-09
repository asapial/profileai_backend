import status from 'http-status';
import { Prisma } from '../../../prisma/generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { bustDashboardCache } from '../dashboard/dashboard.service';
import AppError from '../../errorHelpers/AppError';
import {
  CreateApplicationInput,
  UpdateApplicationInput,
  PatchStatusInput,
} from './application.schema';

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

const APPLICATION_STATUS = ['APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN'] as const;
type ApplicationStatus = (typeof APPLICATION_STATUS)[number];

const collectDueRemindersAndMarkFired = async (
  userId: string,
  now: Date,
): Promise<Array<{ id: string; company: string; role: string; reminderAt: Date }>> => {
  const due = await prisma.jobApplication.findMany({
    where: {
      userId,
      reminderAt: { lte: now, not: null },
      events: { none: { type: 'REMINDER_FIRED' } },
    },
    select: { id: true, company: true, role: true, reminderAt: true },
    orderBy: { reminderAt: 'asc' },
    take: 50,
  });

  if (due.length === 0) return [];

  await prisma.$transaction(
    due.map((d) =>
      prisma.applicationEvent.create({
        data: {
          applicationId: d.id,
          userId,
          type: 'REMINDER_FIRED',
          payload: { reminderAt: d.reminderAt } as Prisma.InputJsonValue,
        },
      }),
    ),
  );

  return due.map((d) => ({
    id: d.id,
    company: d.company,
    role: d.role,
    reminderAt: d.reminderAt as Date,
  }));
};

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
      ...(statusFilter
        ? { status: statusFilter as ApplicationStatus }
        : {}),
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

  const dueReminders = await collectDueRemindersAndMarkFired(userId, new Date());

  return { items, nextCursor, counts, dueReminders };
};

export const getApplication = async (userId: string, id: string) => {
  const item = await prisma.jobApplication.findFirst({
    where: { id, userId },
    include: {
      resume: { select: { id: true, title: true } },
      events: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          type: true,
          payload: true,
          createdAt: true,
        },
      },
    },
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
    status?: ApplicationStatus;
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

  if (input.status) data.status = input.status as ApplicationStatus;
  if (input.jobUrl !== undefined) data.jobUrl = input.jobUrl && input.jobUrl !== '' ? input.jobUrl : null;
  if (input.location) data.location = input.location;
  if (input.appliedAt) data.appliedAt = new Date(input.appliedAt);
  if (input.notes) data.notes = input.notes;
  if (input.resumeId !== undefined) data.resumeId = input.resumeId ?? null;

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.jobApplication.create({ data });
    await tx.applicationEvent.create({
      data: {
        applicationId: row.id,
        userId,
        type: 'CREATED',
        payload: { company: row.company, role: row.role, status: row.status } as Prisma.InputJsonValue,
      },
    });
    return row;
  });
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
    status?: ApplicationStatus;
    jobUrl?: string | null;
    location?: string;
    appliedAt?: Date;
    notes?: string;
    resumeId?: string | null;
    coverLetterId?: string | null;
    reminderAt?: Date | null;
  } = {};

  if (input.company !== undefined) data.company = input.company;
  if (input.role !== undefined) data.role = input.role;
  if (input.status !== undefined) data.status = input.status as ApplicationStatus;
  if (input.jobUrl !== undefined) data.jobUrl = input.jobUrl === '' ? null : input.jobUrl;
  if (input.location !== undefined) data.location = input.location;
  if (input.appliedAt !== undefined) data.appliedAt = new Date(input.appliedAt);
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.resumeId !== undefined) {
    data.resumeId = input.resumeId === null ? null : input.resumeId;
  }
  if (input.coverLetterId !== undefined) {
    data.coverLetterId = input.coverLetterId === null ? null : input.coverLetterId;
  }
  if (input.reminderAt !== undefined) {
    data.reminderAt = input.reminderAt === null ? null : new Date(input.reminderAt);
  }

  const priorReminderAt = existing.reminderAt;
  const priorNotes = existing.notes;
  const priorStatus = existing.status;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.jobApplication.update({ where: { id }, data });

    const events: Array<{
      applicationId: string;
      userId: string;
      type:
        | 'CREATED'
        | 'STATUS_CHANGE'
        | 'NOTE_EDIT'
        | 'REMINDER_SET'
        | 'REMINDER_FIRED'
        | 'DOCUMENT_ATTACHED';
      payload?: Prisma.InputJsonValue;
    }> = [];

    if (input.status !== undefined && input.status !== priorStatus) {
      events.push({
        applicationId: row.id,
        userId,
        type: 'STATUS_CHANGE',
        payload: { from: priorStatus, to: row.status } as Prisma.InputJsonValue,
      });
    }

    if (input.notes !== undefined && input.notes !== priorNotes) {
      events.push({
        applicationId: row.id,
        userId,
        type: 'NOTE_EDIT',
        payload: { hasNotes: !!input.notes } as Prisma.InputJsonValue,
      });
    }

    const reminderChanged =
      input.reminderAt !== undefined &&
      (priorReminderAt?.toISOString() ?? null) !== (row.reminderAt?.toISOString() ?? null);
    if (reminderChanged) {
      events.push({
        applicationId: row.id,
        userId,
        type: 'REMINDER_SET',
        payload: { reminderAt: row.reminderAt } as Prisma.InputJsonValue,
      });
    }

    if (events.length > 0) {
      await tx.applicationEvent.createMany({ data: events });
    }

    return row;
  });

  await bustDashboardCache(userId);
  return updated;
};

export const patchStatus = async (
  userId: string,
  id: string,
  input: PatchStatusInput,
) => {
  const existing = await prisma.jobApplication.findFirst({ where: { id, userId } });
  if (!existing) throw new AppError(status.NOT_FOUND, 'Application not found.');

  const next = input.status as ApplicationStatus;
  if (next === existing.status) return existing;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.jobApplication.update({
      where: { id },
      data: { status: next },
    });
    await tx.applicationEvent.create({
      data: {
        applicationId: row.id,
        userId,
        type: 'STATUS_CHANGE',
        payload: { from: existing.status, to: next } as Prisma.InputJsonValue,
      },
    });
    return row;
  });

  await bustDashboardCache(userId);
  return updated;
};

export const getTimeline = async (userId: string, id: string) => {
  const existing = await prisma.jobApplication.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) throw new AppError(status.NOT_FOUND, 'Application not found.');

  const events = await prisma.applicationEvent.findMany({
    where: { applicationId: id, userId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      type: true,
      payload: true,
      createdAt: true,
    },
  });

  return events;
};

export const deleteApplication = async (userId: string, id: string) => {
  const existing = await prisma.jobApplication.findFirst({ where: { id, userId } });
  if (!existing) throw new AppError(status.NOT_FOUND, 'Application not found.');

  await prisma.jobApplication.delete({ where: { id } });
  await bustDashboardCache(userId);
  return { id };
};
