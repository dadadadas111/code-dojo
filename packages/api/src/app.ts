import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

export async function createServer() {
  const app = express();

  // --------------- Middleware ---------------
  app.use(cors());
  app.use(express.json());
  app.use(morgan('dev'));

  // --------------- Health Check ---------------
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'code-dojo-api',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
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
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error('[API] Unhandled error:', err);
      res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
      });
    },
  );

  return app;
}
