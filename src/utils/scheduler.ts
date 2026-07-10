import { Queue, Worker, QueueEvents } from 'bullmq';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';

const QUEUE_NAME = 'profileai-scheduler';

// ─── Queue ────────────────────────────────────────────
export const schedulerQueue = new Queue(QUEUE_NAME, {
  connection: redis as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
});

// ─── Worker ───────────────────────────────────────────
export const schedulerWorker = new Worker(
  QUEUE_NAME,
  async (job) => {
    if (job.name === 'monthly-limit-reset') {
      console.log('[Scheduler] Running monthly limit reset...');

      const resetAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await prisma.userLimit.updateMany({
        data: { resumeUsed: 0, apiUsed: 0, resetAt },
      });
      await prisma.userProfile.updateMany({
        data: { apiCallCount: 0 },
      });

      console.log(`[Scheduler] Monthly limits reset for all users. Next reset: ${resetAt.toISOString()}`);
    }
  },
  { connection: redis as any }
);

// ─── Schedule Monthly Reset ───────────────────────────
export const scheduleMonthlyReset = async (): Promise<void> => {
  // Remove existing repeatable job if any
  await schedulerQueue.removeRepeatable('monthly-limit-reset', {
    pattern: '0 0 1 * *', // 1st of every month at midnight
  });

  await schedulerQueue.add(
    'monthly-limit-reset',
    {},
    {
      repeat: { pattern: '0 0 1 * *' }, // Cron: every 1st at midnight
    }
  );

  console.log('[Scheduler] Monthly limit reset job scheduled.');
};

schedulerWorker.on('completed', (job) => {
  console.log(`[Scheduler] Job "${job.name}" completed.`);
});

schedulerWorker.on('failed', (job, err) => {
  console.error(`[Scheduler] Job "${job?.name}" failed:`, err.message);
});

// --- Hot-reload cleanup ---------------------------------
const RELOAD_SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
for (const signal of RELOAD_SIGNALS) {
  process.once(signal, () => {
    console.log(`[Scheduler] ${signal} received, closing queue + worker�`);
    Promise.allSettled([schedulerWorker.close(), schedulerQueue.close()]).catch(() => undefined);
  });
}
