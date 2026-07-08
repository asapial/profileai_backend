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
    // Note: we don't call redis.connect() here. The BullMQ Queue/Worker
    // instances in src/utils/scheduler.ts connect the shared ioredis instance
    // on construction (their pub/sub channels need a live connection the
    // moment the queue is created). Calling connect() again throws
    // "Redis is already connecting/connected".
    //
    // To confirm the connection is live before serving traffic, we wait for
    // the first await on a BullMQ operation below (`scheduleMonthlyReset`).
    console.log('[Redis] Connection owned by BullMQ; readiness verified via scheduler init.');

    // ── MinIO ─────────────────────────────────────────
    // Optional: when SKIP_MINIO=true the dev server boots without an S3-compatible
    // object store. Any code path that actually calls uploadBuffer / getPresignedUrl /
    // deleteObject will throw a clear "MinIO is disabled" error instead of crashing.
    if (process.env.SKIP_MINIO === 'true') {
      console.log('[MinIO] Skipped (SKIP_MINIO=true). Object storage is disabled.');
    } else {
      try {
        await ensureBucketExists();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `[MinIO] ensureBucketExists failed: ${message}. ` +
            `Continuing without MinIO. Set SKIP_MINIO=true in .env to silence this.`
        );
      }
    }

    // ── BullMQ Scheduler ──────────────────────────────
    await scheduleMonthlyReset();

    // ── Start Server ──────────────────────────────────
    app.listen(PORT, () => {
      console.log(`[Server] ProFile AI API running on http://localhost:${PORT}`);
      console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('[Server] Fatal startup error:', error);
    await prisma.$disconnect().catch(() => undefined);
    // Guard: the redis client is shared with BullMQ, which may leave it in
    // any of {connecting, ready, closed}. `quit()` only succeeds on `ready`.
    try {
      if (redis.status === 'ready' || redis.status === 'connecting') {
        await redis.quit();
      } else if (redis.status !== 'end') {
        redis.disconnect();
      }
    } catch {
      /* best-effort cleanup; we're already shutting down */
    }
    process.exit(1);
  }
}

main();