import { createServer } from './app';

const PORT = process.env.API_PORT ? parseInt(process.env.API_PORT, 10) : 3000;
const HOST = process.env.API_HOST || '0.0.0.0';

async function main() {
  const app = await createServer();

  app.listen(PORT, HOST, () => {
    console.log(`[API] Code Dojo API running at http://${HOST}:${PORT}`);
    console.log(`[API] Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

main().catch((err) => {
  console.error('[API] Failed to start:', err);
  process.exit(1);
});
