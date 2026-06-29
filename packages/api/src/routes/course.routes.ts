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
  createCourse,
  listCourses,
  getCourseById,
  getActiveCourse,
  updateCourse,
} from '../services/course.service';

const paginationQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

const idParam = z.object({ id: z.string() });

const createBody = z.object({
  name: z.string().min(1),
  description: z.string(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional(),
});

const updateBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional(),
});

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function wrap(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export const courseRouter: IRouter = Router();

courseRouter.get(
  '/',
  validate({ query: paginationQuery }),
  wrap(async (req, res) => {
    const query = req.query as z.infer<typeof paginationQuery>;
    const data = await listCourses(query);
    res.json({ success: true, data });
  }),
);

courseRouter.post(
  '/',
  requireTeacher,
  validate({ body: createBody }),
  wrap(async (req, res) => {
    const data = await createCourse(req.body as z.infer<typeof createBody>);
    res.status(201).json({ success: true, data });
  }),
);

// Must be defined before /:id to avoid shadowing
courseRouter.get(
  '/active',
  wrap(async (_req, res) => {
    const data = await getActiveCourse();
    res.json({ success: true, data });
  }),
);

courseRouter.get(
  '/:id',
  validate({ params: idParam }),
  wrap(async (req, res) => {
    const data = await getCourseById(req.params['id'] as string);
    res.json({ success: true, data });
  }),
);

courseRouter.patch(
  '/:id',
  requireTeacher,
  validate({ params: idParam, body: updateBody }),
  wrap(async (req, res) => {
    const data = await updateCourse(
      req.params['id'] as string,
      req.body as z.infer<typeof updateBody>,
    );
    res.json({ success: true, data });
  }),
);
