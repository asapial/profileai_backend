import app from './app';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';
import { ensureBucketExists } from './lib/minio';
import { scheduleMonthlyReset } from './utils/scheduler';

const PORT = process.env.PORT || 5000;

async function main() {
  try {
    // ── Database ────────────────────────────────────
    await prisma.$connect();
    console.log('[DB] Connected to PostgreSQL successfully.');

    // ── Redis ────────────────────────────────────────
    await redis.connect();
    console.log('[Redis] Connected successfully.');

    // ── MinIO ─────────────────────────────────────────
    await ensureBucketExists();

    // ── BullMQ Scheduler ──────────────────────────────
    await scheduleMonthlyReset();

    // ── Start Server ──────────────────────────────────
    app.listen(PORT, () => {
      console.log(`[Server] ProFile AI API running on http://localhost:${PORT}`);
      console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('[Server] Fatal startup error:', error);
    await prisma.$disconnect();
    await redis.quit();
    process.exit(1);
  }
}

main();