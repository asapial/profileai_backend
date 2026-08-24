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

type BullMqRedisOptions = typeof redis.options & { skipVersionCheck?: boolean };

const getPolicy = (reply: unknown): string | undefined => {
  if (Array.isArray(reply)) {
    const values = reply.map(String);
    const index = values.findIndex((value) => value.toLowerCase() === 'maxmemory-policy');
    return index >= 0 ? values[index + 1]?.toLowerCase() : values[1]?.toLowerCase();
  }
  if (reply && typeof reply === 'object') {
    const value = (reply as Record<string, unknown>)['maxmemory-policy'];
    return typeof value === 'string' ? value.toLowerCase() : undefined;
  }
  return undefined;
};

const getPolicyFromInfo = (info: string): string | undefined =>
  info.match(/^maxmemory_policy:([^\r\n]+)$/m)?.[1]?.trim().toLowerCase();

const errorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === 'object') {
    const details = Object.entries(error)
      .filter(([, value]) => ['string', 'number'].includes(typeof value))
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(', ');
    if (details) return details;
  }
  return 'Redis rejected the CONFIG command';
};

/**
 * Validate BullMQ's durability requirement before any queue is constructed.
 * Redis Cloud and local Redis may allow CONFIG SET; when they do, the policy
 * is repaired automatically. Managed services that deny CONFIG receive one
 * actionable warning in development (and fail fast in production) instead of
 * BullMQ printing the same warning for every connection.
 */
export const prepareRedisForBullMq = async (): Promise<void> => {
  if (redis.status === 'wait') await redis.connect();
  await redis.ping();

  let policy: string | undefined;
  try {
    policy = getPolicy(await redis.config('GET', 'maxmemory-policy'));
    policy ??= getPolicyFromInfo(await redis.info());

    if (policy && policy !== 'noeviction') {
      await redis.config('SET', 'maxmemory-policy', 'noeviction');
      policy = getPolicy(await redis.config('GET', 'maxmemory-policy'));
      policy ??= getPolicyFromInfo(await redis.info());
    }

    if (policy !== 'noeviction') {
      throw new Error(`Redis reported maxmemory-policy=${policy ?? 'unknown'}`);
    }

    (redis.options as BullMqRedisOptions).skipVersionCheck = true;
    console.log('[Redis] Ready (PING ok, maxmemory-policy=noeviction).');
  } catch (error) {
    (redis.options as BullMqRedisOptions).skipVersionCheck = true;
    const details = errorMessage(error);

    // Redis Cloud can expose the current policy through INFO while rejecting
    // CONFIG SET. In development, acknowledge that provider-managed policy
    // once and keep BullMQ's duplicate connection checks disabled. Production
    // remains strict because an evicted queue key could lose a real job.
    if (
      process.env.NODE_ENV !== 'production' &&
      details.includes('Unsupported CONFIG parameter')
    ) {
      console.log(
        `[Redis] Ready (provider-managed maxmemory-policy=${policy ?? 'unknown'}; ` +
          `noeviction enforcement is deferred to production).`
      );
      return;
    }

    const guidance =
      `Set maxmemory-policy=noeviction in the Redis provider, then restart the API. ` +
      `Details: ${details}`;

    if (process.env.NODE_ENV === 'production') {
      throw new Error(`[Redis] BullMQ requires a noeviction policy. ${guidance}`);
    }

    console.warn(`[Redis] BullMQ durability warning: ${guidance}`);
  }
};

export const closeRedis = async (): Promise<void> => {
  const currentStatus = redis.status;
  if (currentStatus === 'ready' || currentStatus === 'connecting') {
    await redis.quit().catch(() => redis.disconnect());
  } else if (currentStatus !== 'end') {
    redis.disconnect();
  }
};
