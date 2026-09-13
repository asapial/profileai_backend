import { purgeCareerData } from '../modules/career/career.maintenance';
import { Queue, Worker, QueueEvents } from 'bullmq';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';

import { processDeliveries } from '../modules/career/career.integrations';

const QUEUE_NAME = 'profileai-scheduler';

// â”€â”€â”€ Queue â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const schedulerQueue = new Queue(QUEUE_NAME, {
  connection: redis as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
});

// â”€â”€â”€ Worker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const schedulerWorker = new Worker(
  QUEUE_NAME,
  async (job) => {
    if (job.name === 'career-maintenance') await purgeCareerData();
    if (job.name === 'career-deliveries') await processDeliveries();
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

// â”€â”€â”€ Schedule Monthly Reset â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const scheduleMonthlyReset = async (): Promise<void> => {
  if (process.env.CAREER_MAINTENANCE_ENABLED === 'true') await schedulerQueue.add('career-maintenance', {}, { repeat: { every: 3600000 }, jobId: 'career-maintenance', removeOnComplete: 20, removeOnFail: 20 });
  await schedulerQueue.add('career-deliveries', {}, { repeat: { every: 60000 }, jobId: 'career-deliveries', removeOnComplete: 20, removeOnFail: 20 });
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

export const closeScheduler = async (): Promise<void> => {
  await Promise.allSettled([schedulerWorker.close(), schedulerQueue.close()]);
};
