import { Redis } from 'ioredis';
import { envVars } from '../config/env';

const createRedisClient = (): Redis => {
  const client = new Redis(envVars.REDIS.REDIS_URL, {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
    lazyConnect: true,
  });

  client.on('connect', () => {
    console.log('[Redis] Connected successfully');
  });

  client.on('error', (err) => {
    // Silent for "connection is closed" — happens during hot-reload cleanup.
    if (err.message.includes('Connection is closed')) return;
    console.error('[Redis] Connection error:', err.message);
  });

  client.on('reconnecting', () => {
    console.warn('[Redis] Reconnecting...');
  });

  return client;
};

export const redis = createRedisClient();

// --- Hot-reload cleanup --------------------------------
// `tsx watch` sends SIGINT (and on some platforms SIGTERM) to the old child
// before spawning a fresh one. Without an explicit quit the orphan ioredis
// socket stays open and, after many reloads, saturates the server's
// `maxclients` ceiling. We also unref the connection manager so the loop can
// exit when nothing else is keeping the process alive.
const RELOAD_SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
for (const signal of RELOAD_SIGNALS) {
  process.once(signal, () => {
    const status = redis.status;
    console.log(`[Redis] ${signal} received, closing client (status=${status})…`);
    try {
      if (status === 'ready' || status === 'connecting') {
        redis.quit().catch(() => redis.disconnect());
      } else if (status !== 'end') {
        redis.disconnect();
      }
    } catch {
      /* best-effort */
    }
  });
}
