import status from 'http-status';
import { prisma } from '../../lib/prisma';
import { exportQueue, ExportJobPayload } from '../../utils/exportQueue';
import AppError from '../../errorHelpers/AppError';

export const enqueueUserExport = async (userId: string) => {
  const job = await prisma.exportJob.create({
    data: {
      kind: 'USER_DATA',
      userId,
      status: 'PENDING',
      payload: { kind: 'USER_DATA' },
    },
  });

  const payload: ExportJobPayload = { kind: 'USER_DATA', userId, jobId: job.id };
  await exportQueue.add('user-data-export', payload);
  return job;
};

export const enqueueResumeExport = async (userId: string, resumeId: string) => {
  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId } });
  if (!resume) throw new AppError(status.NOT_FOUND, 'Resume not found.');

  const job = await prisma.exportJob.create({
    data: {
      kind: 'RESUME_PDF',
      userId,
      status: 'PENDING',
      payload: { kind: 'RESUME_PDF', resumeId },
    },
  });

  const payload: ExportJobPayload = { kind: 'RESUME_PDF', userId, jobId: job.id, resumeId };
  await exportQueue.add('resume-export', payload);
  return job;
};

export const enqueueCoverLetterExport = async (
  userId: string,
  coverLetterId: string,
) => {
  const letter = await prisma.coverLetter.findFirst({
    where: { id: coverLetterId, userId, deletedAt: null },
  });
  if (!letter) throw new AppError(status.NOT_FOUND, 'Cover letter not found.');

  const job = await prisma.exportJob.create({
    data: {
      kind: 'COVER_LETTER_PDF',
      userId,
      status: 'PENDING',
      payload: { kind: 'COVER_LETTER_PDF', coverLetterId },
    },
  });

  const payload: ExportJobPayload = {
    kind: 'COVER_LETTER_PDF',
    userId,
    jobId: job.id,
    coverLetterId,
  };
  await exportQueue.add('cover-letter-export', payload);
  return job;
};

export const listExportJobs = async (userId: string, limit = 20) => {
  return prisma.exportJob.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 100),
  });
};

export const getExportJob = async (userId: string, id: string) => {
  const job = await prisma.exportJob.findFirst({ where: { id, userId } });
  if (!job) throw new AppError(status.NOT_FOUND, 'Export job not found.');
  return job;
};
