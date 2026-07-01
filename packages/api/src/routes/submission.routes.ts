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
  createSubmission,
  gradeSubmission,
  getSubmissionById,
  listSubmissions,
  resubmitSubmission,
} from '../services/submission.service';

const paginationQuery = z.object({
  homeworkId: z.string().optional(),
  status: z.enum(['pending', 'grading', 'accepted', 'revision', 'late']).optional(),
  discordId: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

const idParam = z.object({ id: z.string() });

const createBody = z.object({
  discordId: z.string(),
  homeworkId: z.string(),
  content: z.string().optional(),
  githubLink: z.string().url().optional(),
  fileUrl: z.string().url().optional(),
});

const gradeBody = z.object({
  status: z.enum(['grading', 'accepted', 'revision']),
  score: z.number().int().optional(),
  feedback: z.string().optional(),
});

const resubmitBody = z.object({
  discordId: z.string(),
  content: z.string().optional(),
  githubLink: z.string().url().optional(),
  fileUrl: z.string().url().optional(),
});

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function wrap(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export const submissionRouter: IRouter = Router();

submissionRouter.post(
  '/',
  validate({ body: createBody }),
  wrap(async (req, res) => {
    const data = await createSubmission(req.body as z.infer<typeof createBody>);
    res.status(201).json({ success: true, data });
  }),
);

submissionRouter.get(
  '/',
  validate({ query: paginationQuery }),
  wrap(async (req, res) => {
    const data = await listSubmissions(req.query as z.infer<typeof paginationQuery>);
    res.json({ success: true, data });
  }),
);

submissionRouter.get(
  '/:id',
  validate({ params: idParam }),
  wrap(async (req, res) => {
    const data = await getSubmissionById(req.params['id'] as string);
    res.json({ success: true, data });
  }),
);

submissionRouter.patch(
  '/:id/resubmit',
  validate({ params: idParam, body: resubmitBody }),
  wrap(async (req, res) => {
    const data = await resubmitSubmission(
      req.params['id'] as string,
      req.body as z.infer<typeof resubmitBody>,
    );
    res.json({ success: true, data });
  }),
);

submissionRouter.patch(
  '/:id',
  requireTeacher,
  validate({ params: idParam, body: gradeBody }),
  wrap(async (req, res) => {
    const data = await gradeSubmission(
      req.params['id'] as string,
      req.body as z.infer<typeof gradeBody>,
    );
    res.json({ success: true, data });
  }),
);
