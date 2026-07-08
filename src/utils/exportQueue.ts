// ─────────────────────────────────────────────────────
// BullMQ queue + worker for async exports
// (USER_DATA / RESUME_PDF). The worker serializes the
// user's data to JSON, uploads it to MinIO, and writes
// the resulting presigned URL back to the ExportJob row.
// ─────────────────────────────────────────────────────
import { Queue, Worker, Job } from 'bullmq';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { uploadBuffer, getPresignedUrl } from '../lib/minio';
import AppError from '../errorHelpers/AppError';
import status from 'http-status';

const QUEUE_NAME = 'profileai-export';

// ─── Queue ────────────────────────────────────────────
// BullMQ ships its own ioredis copy; cast to any to bridge the duplicate-type mismatch.
export const exportQueue = new Queue(QUEUE_NAME, {
  connection: redis as any,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 24 * 3600, count: 1000 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});

export type ExportJobPayload =
  | { kind: 'USER_DATA'; userId: string; jobId: string }
  | { kind: 'RESUME_PDF'; userId: string; jobId: string; resumeId: string };

// ─── Worker ───────────────────────────────────────────
export const exportWorker = new Worker(
  QUEUE_NAME,
  async (job: Job<ExportJobPayload>) => {
    const { kind, userId, jobId } = job.data;

    // Mark as running.
    await prisma.exportJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    try {
      let objectName: string;
      let buffer: Buffer;

      if (kind === 'USER_DATA') {
        const dump = await buildUserDataDump(userId);
        buffer = Buffer.from(JSON.stringify(dump, null, 2), 'utf8');
        objectName = `exports/${userId}/user-data-${jobId}.json`;
      } else if (kind === 'RESUME_PDF') {
        const { resumeId } = job.data as Extract<ExportJobPayload, { kind: 'RESUME_PDF' }>;
        const resume = await prisma.resume.findFirst({
          where: { id: resumeId, userId },
          select: { id: true, contentData: true, title: true },
        });
        if (!resume) throw new AppError(status.NOT_FOUND, 'Resume not found.');
        // The actual PDF rendering is owned by the resume module's /export
        // endpoint. Here we export the contentData blob as a placeholder so
        // the queue job is testable end-to-end without the PDF pipeline.
        buffer = Buffer.from(JSON.stringify(resume, null, 2), 'utf8');
        objectName = `exports/${userId}/resume-${resumeId}-${jobId}.json`;
      } else {
        throw new AppError(status.BAD_REQUEST, 'Unknown export kind.');
      }

      await uploadBuffer(objectName, buffer, 'application/octet-stream');
      const resultUrl = await getPresignedUrl(objectName, 7 * 24 * 3600);

      await prisma.exportJob.update({
        where: { id: jobId },
        data: { status: 'DONE', completedAt: new Date(), resultUrl },
      });

      return { resultUrl };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.exportJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', completedAt: new Date(), errorMsg: message },
      });
      throw err;
    }
  },
  { connection: redis as any, concurrency: 2 },
);

async function buildUserDataDump(userId: string) {
  const [user, profile, limits, prefs, resumes, applications, projects, references] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          twoFactorEnabled: true,
          createdAt: true,
        },
      }),
      prisma.userProfile.findUnique({ where: { userId } }),
      prisma.userLimit.findUnique({ where: { userId } }),
      prisma.notificationPreference.findUnique({ where: { userId } }),
      prisma.resume.findMany({ where: { userId } }),
      prisma.jobApplication.findMany({ where: { userId } }),
      prisma.project.findMany({ where: { userId } }),
      prisma.reference.findMany({ where: { userId } }),
    ]);

  return {
    exportedAt: new Date().toISOString(),
    user,
    profile,
    limits,
    notificationPreferences: prefs,
    resumes,
    applications: applications,
    projects,
    references,
  };
}

// ─── Diagnostics ──────────────────────────────────────
exportWorker.on('completed', (job) => {
  console.log(`[Export] Job ${job.id} (${(job.data as ExportJobPayload).kind}) completed.`);
});

exportWorker.on('failed', (job, err) => {
  console.error(`[Export] Job ${job?.id} failed:`, err.message);
});
