import {
  processDeliveries,
  recheckJob
} from "./chunk-BSTZBVW2.js";
import {
  BUCKET_NAME,
  minioClient,
  prisma,
  redis
} from "./chunk-AQ3QEWOG.js";

// src/modules/career/career.maintenance.ts
async function purgeCareerData() {
  const now = /* @__PURE__ */ new Date();
  await prisma.careerOAuthState.deleteMany({ where: { expiresAt: { lt: now } } });
  const sources = await prisma.careerSource.findMany();
  for (const source of sources) {
    const policy = source.policy;
    const cutoff = new Date(Date.now() - (policy.retentionDays ?? 30) * 864e5);
    await prisma.job.updateMany({ where: { sourceType: { in: ["LEVER", "GREENHOUSE"] }, listings: { some: { sourceName: source.id, lastSeenAt: { lt: cutoff } } }, lastVerifiedAt: { lt: cutoff } }, data: { description: "Source retention period elapsed. Open the original listing for details.", contentHash: null } });
  }
  await prisma.careerDelivery.updateMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 864e5) }, state: { notIn: ["QUEUED", "SENDING"] } }, data: { payload: {} } });
  const deleted = await prisma.coverLetter.findMany({ where: { deletedAt: { lt: new Date(Date.now() - 7 * 864e5) } }, select: { id: true }, take: 100 });
  if (deleted.length) {
    const ids = deleted.map((d) => d.id);
    await prisma.$transaction([prisma.jobApplication.updateMany({ where: { coverLetterId: { in: ids } }, data: { coverLetterId: null } }), prisma.coverLetter.deleteMany({ where: { id: { in: ids } } })]);
  }
  await prisma.exportJob.updateMany({ where: { completedAt: { lt: new Date(Date.now() - 864e5) } }, data: { resultUrl: null } });
  if (process.env.SKIP_MINIO !== "true") {
    const stream = minioClient.listObjectsV2(BUCKET_NAME, "exports/", true);
    for await (const object of stream) {
      if (object.name && object.lastModified && object.lastModified.getTime() < Date.now() - 864e5) await minioClient.removeObject(BUCKET_NAME, object.name);
    }
  }
  const jobs = await prisma.job.findMany({ where: { sourceType: { in: ["LEVER", "GREENHOUSE"] }, lifecycle: { in: ["ACTIVE", "POSSIBLY_EXPIRED"] }, OR: [{ lastVerifiedAt: null }, { lastVerifiedAt: { lt: new Date(Date.now() - 864e5) } }] }, take: 5, orderBy: { lastVerifiedAt: "asc" } });
  for (const job of jobs) {
    try {
      await recheckJob(job.userId, job.id);
    } catch {
    }
  }
}

// src/utils/scheduler.ts
import { Queue, Worker } from "bullmq";
var QUEUE_NAME = "profileai-scheduler";
var schedulerQueue = new Queue(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5e3 }
  }
});
var schedulerWorker = new Worker(
  QUEUE_NAME,
  async (job) => {
    if (job.name === "career-maintenance") await purgeCareerData();
    if (job.name === "career-deliveries") await processDeliveries();
    if (job.name === "monthly-limit-reset") {
      console.log("[Scheduler] Running monthly limit reset...");
      const resetAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3);
      await prisma.userLimit.updateMany({
        data: { resumeUsed: 0, apiUsed: 0, resetAt }
      });
      await prisma.userProfile.updateMany({
        data: { apiCallCount: 0 }
      });
      console.log(`[Scheduler] Monthly limits reset for all users. Next reset: ${resetAt.toISOString()}`);
    }
  },
  { connection: redis }
);
var scheduleMonthlyReset = async () => {
  if (process.env.CAREER_MAINTENANCE_ENABLED === "true") await schedulerQueue.add("career-maintenance", {}, { repeat: { every: 36e5 }, jobId: "career-maintenance", removeOnComplete: 20, removeOnFail: 20 });
  await schedulerQueue.add("career-deliveries", {}, { repeat: { every: 6e4 }, jobId: "career-deliveries", removeOnComplete: 20, removeOnFail: 20 });
  await schedulerQueue.removeRepeatable("monthly-limit-reset", {
    pattern: "0 0 1 * *"
    // 1st of every month at midnight
  });
  await schedulerQueue.add(
    "monthly-limit-reset",
    {},
    {
      repeat: { pattern: "0 0 1 * *" }
      // Cron: every 1st at midnight
    }
  );
  console.log("[Scheduler] Monthly limit reset job scheduled.");
};
schedulerWorker.on("completed", (job) => {
  console.log(`[Scheduler] Job "${job.name}" completed.`);
});
schedulerWorker.on("failed", (job, err) => {
  console.error(`[Scheduler] Job "${job?.name}" failed:`, err.message);
});
var closeScheduler = async () => {
  await Promise.allSettled([schedulerWorker.close(), schedulerQueue.close()]);
};
export {
  closeScheduler,
  scheduleMonthlyReset,
  schedulerQueue,
  schedulerWorker
};
