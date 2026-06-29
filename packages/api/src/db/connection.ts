import mongoose from 'mongoose';
import Redis from 'ioredis';
import { env } from '../config/env';

function safeHost(uri: string): string {
  try {
    return new URL(uri).host;
  } catch {
    return '(unparseable uri)';
  }
}

export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: null,
});

redis.on('error', (err: Error) => {
  console.error('[Redis] Connection error:', err.message);
});

export async function connectMongo(): Promise<void> {
  mongoose.connection.on('error', (err: Error) => {
    console.error('[MongoDB] Connection error:', err.message);
  });
  await mongoose.connect(env.MONGODB_URI);
  console.log('[MongoDB] Connected to', safeHost(env.MONGODB_URI));
}

export async function connectRedis(): Promise<void> {
  await redis.connect();
  console.log('[Redis] Connected to', safeHost(env.REDIS_URL));
}

export async function disconnectAll(): Promise<void> {
  await Promise.allSettled([mongoose.disconnect(), redis.quit()]);
}
