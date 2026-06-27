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
    console.error('[Redis] Connection error:', err.message);
  });

  client.on('reconnecting', () => {
    console.warn('[Redis] Reconnecting...');
  });

  return client;
};

export const redis = createRedisClient();
