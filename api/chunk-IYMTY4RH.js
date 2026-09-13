import {
  AppError_default,
  getPresignedUrl,
  prisma,
  redis,
  uploadBuffer
} from "./chunk-AQ3QEWOG.js";

// src/utils/exportQueue.ts
import { Queue, Worker } from "bullmq";
import status from "http-status";
var QUEUE_NAME = "profileai-export";
var exportQueue = new Queue(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 5e3 },
    removeOnComplete: { age: 24 * 3600, count: 1e3 },
    removeOnFail: { age: 7 * 24 * 3600 }
  }
});
var exportWorker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const { kind, userId, jobId } = job.data;
    await prisma.exportJob.update({
      where: { id: jobId },
      data: { status: "RUNNING", startedAt: /* @__PURE__ */ new Date() }
    });
    try {
      let objectName;
      let buffer;
      if (kind === "USER_DATA") {
        const dump = await buildUserDataDump(userId);
        buffer = Buffer.from(JSON.stringify(dump, null, 2), "utf8");
        objectName = `exports/${userId}/user-data-${jobId}.json`;
      } else if (kind === "RESUME_PDF") {
        const { resumeId } = job.data;
        const resume = await prisma.resume.findFirst({
          where: { id: resumeId, userId },
          select: { id: true, contentData: true, title: true }
        });
        if (!resume) throw new AppError_default(status.NOT_FOUND, "Resume not found.");
        buffer = Buffer.from(JSON.stringify(resume, null, 2), "utf8");
        objectName = `exports/${userId}/resume-${resumeId}-${jobId}.json`;
      } else if (kind === "COVER_LETTER_PDF") {
        const { coverLetterId } = job.data;
        const letter = await prisma.coverLetter.findFirst({
          where: { id: coverLetterId, userId, deletedAt: null },
          select: {
            id: true,
            title: true,
            targetCompany: true,
            targetJobTitle: true,
            contentJson: true
          }
        });
        if (!letter) throw new AppError_default(status.NOT_FOUND, "Cover letter not found.");
        buffer = Buffer.from(JSON.stringify(letter, null, 2), "utf8");
        objectName = `exports/${userId}/cover-letter-${coverLetterId}-${jobId}.json`;
      } else {
        throw new AppError_default(status.BAD_REQUEST, "Unknown export kind.");
      }
      await uploadBuffer(objectName, buffer, "application/octet-stream");
      const resultUrl = await getPresignedUrl(objectName, 900);
      await prisma.exportJob.update({
        where: { id: jobId },
        data: { status: "DONE", completedAt: /* @__PURE__ */ new Date(), resultUrl }
      });
      return { resultUrl };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.exportJob.update({
        where: { id: jobId },
        data: { status: "FAILED", completedAt: /* @__PURE__ */ new Date(), errorMsg: message }
      });
      throw err;
    }
  },
  { connection: redis, concurrency: 2 }
);
async function buildUserDataDump(userId) {
  const [user, profile, limits, prefs, resumes, applications, projects, references] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        twoFactorEnabled: true,
        createdAt: true
      }
    }),
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.userLimit.findUnique({ where: { userId } }),
    prisma.notificationPreference.findUnique({ where: { userId } }),
    prisma.resume.findMany({ where: { userId } }),
    prisma.jobApplication.findMany({ where: { userId } }),
    prisma.project.findMany({ where: { userId } }),
    prisma.reference.findMany({ where: { userId } })
  ]);
  return {
    exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
    user,
    profile,
    limits,
    notificationPreferences: prefs,
    resumes,
    applications,
    projects,
    references
  };
}
exportWorker.on("completed", (job) => {
  console.log(`[Export] Job ${job.id} (${job.data.kind}) completed.`);
});
exportWorker.on("failed", (job, err) => {
  console.error(`[Export] Job ${job?.id} failed:`, err.message);
});
var closeExportQueue = async () => {
  await Promise.allSettled([exportWorker.close(), exportQueue.close()]);
};

export {
  exportQueue,
  exportWorker,
  closeExportQueue
};
