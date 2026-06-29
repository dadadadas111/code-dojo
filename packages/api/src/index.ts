import 'dotenv/config';
import { createServer } from './app';
import { env } from './config/env';
import { connectMongo, connectRedis, disconnectAll } from './db/connection';

async function main(): Promise<void> {
  await connectMongo();
  await connectRedis();

  const app = await createServer();

  const server = app.listen(env.API_PORT, env.API_HOST, () => {
    console.log(`[API] Code Dojo API running at http://${env.API_HOST}:${env.API_PORT}`);
    console.log(`[API] Environment: ${env.NODE_ENV}`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[API] ${signal} received, shutting down...`);
    try {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
      await disconnectAll();
      process.exit(0);
    } catch (err) {
      console.error('[API] Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[API] Failed to start:', err);
  process.exit(1);
});
