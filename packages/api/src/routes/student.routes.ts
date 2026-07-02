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
import {
  registerStudent,
  listStudents,
  getStudentById,
  getStudentByDiscordId,
  updateStudent,
} from '../services/student.service';
import { listByStudent } from '../services/activitylog.service';

const registerBody = z.object({
  discordId: z.string().min(1),
  displayName: z.string().min(1).max(100),
});

const paginationQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

const activityQuery = paginationQuery.extend({
  type: z
    .enum([
      'xp_earned',
      'coin_earned',
      'coin_spent',
      'level_up',
      'achievement_earned',
      'submission_created',
      'submission_graded',
      'attendance_checked',
      'streak_updated',
      'item_purchased',
    ])
    .optional(),
});

const idParam = z.object({ id: z.string() });

const discordParam = z.object({ discordId: z.string().min(1) });

const updateBody = z.object({
  displayName: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
});

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function wrap(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export const studentRouter: IRouter = Router();

studentRouter.post(
  '/',
  validate({ body: registerBody }),
  wrap(async (req, res) => {
    const data = await registerStudent(req.body as z.infer<typeof registerBody>);
    res.status(201).json({ success: true, data });
  }),
);

studentRouter.get(
  '/',
  validate({ query: paginationQuery }),
  wrap(async (req, res) => {
    const data = await listStudents(req.query as z.infer<typeof paginationQuery>);
    res.json({ success: true, data });
  }),
);

// Define before /:id to avoid shadowing
studentRouter.get(
  '/by-discord/:discordId',
  validate({ params: discordParam }),
  wrap(async (req, res) => {
    const data = await getStudentByDiscordId(req.params['discordId'] as string);
    res.json({ success: true, data });
  }),
);

studentRouter.get(
  '/:id',
  validate({ params: idParam }),
  wrap(async (req, res) => {
    const data = await getStudentById(req.params['id'] as string);
    res.json({ success: true, data });
  }),
);

studentRouter.patch(
  '/:id',
  validate({ params: idParam, body: updateBody }),
  wrap(async (req, res) => {
    const data = await updateStudent(
      req.params['id'] as string,
      req.body as z.infer<typeof updateBody>,
    );
    res.json({ success: true, data });
  }),
);

studentRouter.get(
  '/:id/activity',
  validate({ params: idParam, query: activityQuery }),
  wrap(async (req, res) => {
    const data = await listByStudent(
      req.params['id'] as string,
      req.query as z.infer<typeof activityQuery>,
    );
    res.json({ success: true, data });
  }),
);
