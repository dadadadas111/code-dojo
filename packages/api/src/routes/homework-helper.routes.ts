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
import { getHomeworkForActiveCourse } from '../services/homework.service';

const paginationQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function wrap(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export const homeworkHelperRouter: IRouter = Router();

homeworkHelperRouter.get(
  '/active',
  validate({ query: paginationQuery }),
  wrap(async (req, res) => {
    const data = await getHomeworkForActiveCourse(req.query as z.infer<typeof paginationQuery>);
    res.json({ success: true, data });
  }),
);
