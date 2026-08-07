import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
  type RequestHandler,
} from 'express';
import { resetAllData } from '../services/admin.service';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function wrap(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export const adminRouter: IRouter = Router();

// Destructive dev/testing utility — the bot gates this behind Discord Administrator.
adminRouter.post(
  '/reset',
  wrap(async (_req, res) => {
    const deleted = await resetAllData();
    res.json({ success: true, data: { deleted } });
  }),
);
