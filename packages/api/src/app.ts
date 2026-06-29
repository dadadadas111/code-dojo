import express, { type Application } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { redis } from './db/connection';
import { AppError } from './errors';
import { requireApiKey } from './middleware/auth.middleware';
import { studentRouter } from './routes/student.routes';
import { courseRouter } from './routes/course.routes';
import { lessonRouter } from './routes/lesson.routes';
import { lessonHelperRouter } from './routes/lesson-helper.routes';
import { env } from './config/env';

export async function createServer(): Promise<Application> {
  const app = express();

  // --------------- Middleware ---------------
  app.use(cors());
  app.use(express.json());
  app.use(morgan('dev'));

  // --------------- Health Check (open — no auth) ---------------
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

  // --------------- API Auth (guards all /api routes) ---------------
  app.use('/api', requireApiKey);

  // --------------- API Routes ---------------
  app.use('/api/students', studentRouter);
  app.use('/api/courses', courseRouter);
  app.use('/api/courses/:courseId/lessons', lessonRouter);
  app.use('/api/lessons', lessonHelperRouter);
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
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, error: err.message });
        return;
      }

      if (err instanceof ZodError) {
        const message = err.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ');
        res.status(422).json({ success: false, error: message });
        return;
      }

      console.error('[API] Unhandled error:', err);
      res.status(500).json({
        success: false,
        error: env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
      });
    },
  );

  return app;
}
