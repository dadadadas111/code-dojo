import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
  type RequestHandler,
} from 'express';
import {
  getCurrentLessonForActiveCourse,
  getNextLessonForActiveCourse,
} from '../services/lesson.service';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function wrap(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export const lessonHelperRouter: IRouter = Router();

lessonHelperRouter.get(
  '/next',
  wrap(async (_req, res) => {
    const data = await getNextLessonForActiveCourse();
    res.json({ success: true, data });
  }),
);

lessonHelperRouter.get(
  '/current',
  wrap(async (_req, res) => {
    const data = await getCurrentLessonForActiveCourse();
    res.json({ success: true, data });
  }),
);
