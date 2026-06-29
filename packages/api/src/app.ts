import express, { type Application } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import { redis } from './db/connection';

export async function createServer(): Promise<Application> {
  const app = express();

  // --------------- Middleware ---------------
  app.use(cors());
  app.use(express.json());
  app.use(morgan('dev'));

  // --------------- Health Check ---------------
  app.get('/health', async (_req, res) => {
    const mongoOk = mongoose.connection.readyState === 1;
    let redisOk = false;
    try {
      redisOk = (await redis.ping()) === 'PONG';
    } catch {
      redisOk = false;
    }

    const status = mongoOk && redisOk ? 'ok' : 'degraded';
    res.status(mongoOk && redisOk ? 200 : 503).json({
      status,
      service: 'code-dojo-api',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      mongo: mongoOk ? 'up' : 'down',
      redis: redisOk ? 'up' : 'down',
    });
  });

  // --------------- API Routes (to be implemented) ---------------
  // TODO: Mount routers here
  // app.use('/api/students', studentRouter);
  // app.use('/api/courses', courseRouter);
  // app.use('/api/lessons', lessonRouter);
  // app.use('/api/homework', homeworkRouter);
  // app.use('/api/submissions', submissionRouter);
  // app.use('/api/attendance', attendanceRouter);
  // app.use('/api/gamification', gamificationRouter);
  // app.use('/api/shop', shopRouter);
  // app.use('/api/dashboard', dashboardRouter);

  // --------------- 404 ---------------
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Route not found' });
  });

  // --------------- Error Handler ---------------
  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error('[API] Unhandled error:', err);
      res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
      });
    },
  );

  return app;
}
