import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
  type RequestHandler,
} from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation.middleware';
import { requireTeacher } from '../middleware/teacher.middleware';
import {
  checkin,
  listForLesson,
  listForStudentByDiscordId,
  markAttendance,
  statsForLesson,
} from '../services/attendance.service';

const checkinBody = z.object({ discordId: z.string().min(1) });

const lessonIdParam = z.object({ lessonId: z.string() });

const markBody = z.object({
  discordId: z.string().min(1),
  status: z.enum(['present', 'late', 'absent']),
});

const discordIdParam = z.object({ discordId: z.string() });

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function wrap(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export const attendanceRouter: IRouter = Router();

attendanceRouter.post(
  '/checkin',
  validate({ body: checkinBody }),
  wrap(async (req, res) => {
    const { discordId } = req.body as z.infer<typeof checkinBody>;
    const data = await checkin(discordId);
    res.status(201).json({ success: true, data });
  }),
);

attendanceRouter.post(
  '/lesson/:lessonId/mark',
  requireTeacher,
  validate({ params: lessonIdParam, body: markBody }),
  wrap(async (req, res) => {
    const { discordId, status } = req.body as z.infer<typeof markBody>;
    const data = await markAttendance(req.params['lessonId'] as string, discordId, status);
    res.json({ success: true, data });
  }),
);

attendanceRouter.get(
  '/lesson/:lessonId',
  requireTeacher,
  validate({ params: lessonIdParam }),
  wrap(async (req, res) => {
    const lessonId = req.params['lessonId'] as string;
    const [attendances, stats] = await Promise.all([
      listForLesson(lessonId),
      statsForLesson(lessonId),
    ]);
    res.json({ success: true, data: { attendances, stats } });
  }),
);

attendanceRouter.get(
  '/student/by-discord/:discordId',
  validate({ params: discordIdParam }),
  wrap(async (req, res) => {
    const data = await listForStudentByDiscordId(req.params['discordId'] as string);
    res.json({ success: true, data });
  }),
);
