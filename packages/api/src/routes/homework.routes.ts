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
import { getCourseById } from '../services/course.service';
import { NotFoundError } from '../errors';
import {
  createHomework,
  listHomeworkForCourse,
  getHomeworkById,
  updateHomework,
} from '../services/homework.service';

const paginationQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

const courseIdParam = z.object({ courseId: z.string() });

const homeworkIdParam = z.object({ courseId: z.string(), id: z.string() });

const createBody = z.object({
  title: z.string().min(1),
  description: z.string(),
  type: z.enum(['quiz', 'coding', 'reading', 'practice', 'challenge']),
  deadline: z.coerce.date(),
  xpReward: z.number().int().nonnegative().optional(),
  coinReward: z.number().int().nonnegative().optional(),
  maxScore: z.number().int().positive().optional(),
  lessonId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

const updateBody = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  type: z.enum(['quiz', 'coding', 'reading', 'practice', 'challenge']).optional(),
  deadline: z.coerce.date().optional(),
  xpReward: z.number().int().nonnegative().optional(),
  coinReward: z.number().int().nonnegative().optional(),
  maxScore: z.number().int().positive().optional(),
  lessonId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function wrap(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Validates :courseId param and confirms the course exists before proceeding
const loadCourse: RequestHandler = validate({ params: courseIdParam });

const checkCourseExists: RequestHandler = wrap(async (req, _res, next) => {
  await getCourseById(req.params['courseId'] as string);
  next();
});

export const homeworkRouter: IRouter = Router({ mergeParams: true });

homeworkRouter.use(loadCourse, checkCourseExists);

homeworkRouter.get(
  '/',
  validate({ query: paginationQuery }),
  wrap(async (req, res) => {
    const courseId = req.params['courseId'] as string;
    const data = await listHomeworkForCourse(
      courseId,
      req.query as z.infer<typeof paginationQuery>,
    );
    res.json({ success: true, data });
  }),
);

homeworkRouter.post(
  '/',
  requireTeacher,
  validate({ body: createBody }),
  wrap(async (req, res) => {
    const courseId = req.params['courseId'] as string;
    const data = await createHomework(courseId, req.body as z.infer<typeof createBody>);
    res.status(201).json({ success: true, data });
  }),
);

homeworkRouter.get(
  '/:id',
  validate({ params: homeworkIdParam }),
  wrap(async (req, res) => {
    const courseId = req.params['courseId'] as string;
    const data = await getHomeworkById(req.params['id'] as string);
    if (data.courseId !== courseId) {
      throw new NotFoundError('Homework not found');
    }
    res.json({ success: true, data });
  }),
);

homeworkRouter.patch(
  '/:id',
  requireTeacher,
  validate({ params: homeworkIdParam, body: updateBody }),
  wrap(async (req, res) => {
    const courseId = req.params['courseId'] as string;
    const data = await updateHomework(
      courseId,
      req.params['id'] as string,
      req.body as z.infer<typeof updateBody>,
    );
    res.json({ success: true, data });
  }),
);
