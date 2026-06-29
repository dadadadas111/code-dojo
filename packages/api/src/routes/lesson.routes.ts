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
import {
  createLesson,
  listLessonsForCourse,
  getLessonById,
  updateLesson,
} from '../services/lesson.service';

const paginationQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

const courseIdParam = z.object({ courseId: z.string() });

const lessonIdParam = z.object({ courseId: z.string(), id: z.string() });

const createBody = z.object({
  order: z.number().int().nonnegative(),
  topic: z.string().min(1),
  description: z.string(),
  scheduledDate: z.coerce.date(),
  slideUrl: z.string().url().nullable().optional(),
  recordingUrl: z.string().url().nullable().optional(),
});

const updateBody = z.object({
  order: z.number().int().nonnegative().optional(),
  topic: z.string().min(1).optional(),
  description: z.string().optional(),
  scheduledDate: z.coerce.date().optional(),
  slideUrl: z.string().url().nullable().optional(),
  recordingUrl: z.string().url().nullable().optional(),
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

export const lessonRouter: IRouter = Router({ mergeParams: true });

lessonRouter.use(loadCourse, checkCourseExists);

lessonRouter.get(
  '/',
  validate({ query: paginationQuery }),
  wrap(async (req, res) => {
    const courseId = req.params['courseId'] as string;
    const data = await listLessonsForCourse(courseId, req.query as z.infer<typeof paginationQuery>);
    res.json({ success: true, data });
  }),
);

lessonRouter.post(
  '/',
  requireTeacher,
  validate({ body: createBody }),
  wrap(async (req, res) => {
    const courseId = req.params['courseId'] as string;
    const data = await createLesson(courseId, req.body as z.infer<typeof createBody>);
    res.status(201).json({ success: true, data });
  }),
);

lessonRouter.get(
  '/:id',
  validate({ params: lessonIdParam }),
  wrap(async (req, res) => {
    const courseId = req.params['courseId'] as string;
    const data = await getLessonById(courseId, req.params['id'] as string);
    res.json({ success: true, data });
  }),
);

lessonRouter.patch(
  '/:id',
  requireTeacher,
  validate({ params: lessonIdParam, body: updateBody }),
  wrap(async (req, res) => {
    const courseId = req.params['courseId'] as string;
    const data = await updateLesson(
      courseId,
      req.params['id'] as string,
      req.body as z.infer<typeof updateBody>,
    );
    res.json({ success: true, data });
  }),
);
