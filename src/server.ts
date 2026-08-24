import { createServer, type Server } from 'node:http';
import { prisma } from './lib/prisma';
import { closeRedis, prepareRedisForBullMq } from './lib/redis';
import { ensureBucketExists } from './lib/minio';
import { notificationGateway } from './modules/notification/notification.gateway';

const PORT = Number(process.env.PORT || 5000);

let httpServer: Server | undefined;
let closeBackgroundJobs: () => Promise<void> = async () => undefined;
let shutdownStarted = false;

const listen = (server: Server, port: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port);
  });

const assertPortAvailable = (port: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.once('error', reject);
    probe.listen(port, () => {
      probe.close((error) => (error ? reject(error) : resolve()));
    });
  });

const describeError = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === 'object') {
    const details = Object.entries(error)
      .filter(([, value]) => ['string', 'number'].includes(typeof value))
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(', ');
    if (details) return details;
  }
  return 'Unknown error';
};

const shutdown = async (reason: string, exitCode = 0): Promise<void> => {
  if (shutdownStarted) return;
  shutdownStarted = true;
  console.log(`[Server] Shutting down (${reason})...`);

  notificationGateway.close();
  const closeHttpServer = new Promise<void>((resolve) => {
    if (!httpServer?.listening) return resolve();
    httpServer.close(() => resolve());
  });

  await Promise.allSettled([closeHttpServer, closeBackgroundJobs()]);
  await Promise.allSettled([prisma.$disconnect(), closeRedis()]);
  process.exitCode = exitCode;
};

async function main() {
  try {
    // Fail before opening database, Redis, MinIO, or BullMQ connections when
    // another development server already owns this port.
    await assertPortAvailable(PORT);

    await prisma.$connect();
    console.log('[DB] Connected to PostgreSQL successfully.');

    // This must happen before importing app routes because the export service
    // constructs its BullMQ queue during module initialization.
    await prepareRedisForBullMq();

    if (process.env.SKIP_MINIO === 'true') {
      console.log('[MinIO] Skipped (SKIP_MINIO=true). Object storage is disabled.');
    } else {
      try {
        await ensureBucketExists();
      } catch (error) {
        console.warn(
          `[MinIO] ensureBucketExists failed: ${describeError(error)}. ` +
            `Continuing without MinIO. Set SKIP_MINIO=true in .env to silence this.`
        );
      }
    }

    const [{ default: app }, scheduler, exports] = await Promise.all([
      import('./app'),
      import('./utils/scheduler'),
      import('./utils/exportQueue'),
    ]);

    await scheduler.scheduleMonthlyReset();
    void exports.exportWorker;
    closeBackgroundJobs = async () => {
      await Promise.allSettled([
        scheduler.closeScheduler(),
        exports.closeExportQueue(),
      ]);
    };

    httpServer = createServer(app);
    notificationGateway.attach(httpServer);
    await listen(httpServer, PORT);

    console.log(`[Server] ProFile AI API running on http://localhost:${PORT}`);
    console.log(`[WebSocket] Notifications available at ws://localhost:${PORT}/ws/notifications`);
    console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);

    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.once(signal, () => void shutdown(signal));
    }
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    if (code === 'EADDRINUSE') {
      console.error(
        `[Server] Port ${PORT} is already in use. Stop the existing API process ` +
          `or set PORT to another available port in .env.`
      );
    } else {
      console.error(`[Server] Fatal startup error: ${describeError(error)}`);
    }
    await shutdown('startup failure', 1);
  }
}

void main();
