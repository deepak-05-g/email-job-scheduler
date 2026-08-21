import 'dotenv/config';
import { Redis } from 'ioredis';
import type { ConnectionOptions } from 'bullmq';

export const getRedisUrl = (): string => {
  return process.env.REDIS_URL || 'redis://127.0.0.1:6380';
};

export const createRedisConnection = (): Redis => {
  const redisUrl = getRedisUrl();
  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  client.on('error', (err) => {
    const safeMsg = err instanceof Error ? err.message : 'Unknown Redis Connection Error';
    console.error(`[Redis Error] ${safeMsg}`);
  });

  return client;
};

let sharedRedisClient: Redis | null = null;

export const getSharedRedisConnection = (): Redis => {
  if (!sharedRedisClient) {
    sharedRedisClient = createRedisConnection();
  }
  return sharedRedisClient;
};

export const getBullMQConnectionOptions = (): ConnectionOptions => {
  const redisUrl = getRedisUrl();
  const parsed = new URL(redisUrl);

  return {
    host: parsed.hostname || '127.0.0.1',
    port: parsed.port ? parseInt(parsed.port, 10) : 6379,
    password: parsed.password || undefined,
    username: parsed.username || undefined,
    db: parsed.pathname ? parseInt(parsed.pathname.replace('/', ''), 10) || 0 : 0,
    maxRetriesPerRequest: null,
  };
};

export const checkRedisHealth = async (): Promise<boolean> => {
  try {
    const client = getSharedRedisConnection();
    const response = await client.ping();
    return response === 'PONG';
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Redis Health Check Failed] ${msg}`);
    return false;
  }
};

export const closeRedisConnection = async (): Promise<void> => {
  if (sharedRedisClient) {
    await sharedRedisClient.quit();
    sharedRedisClient = null;
  }
};
