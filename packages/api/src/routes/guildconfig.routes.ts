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
  deleteGuildConfig,
  getGuildConfig,
  upsertGuildConfig,
} from '../services/guildconfig.service';

const guildIdParam = z.object({ guildId: z.string().min(1) });

const upsertBody = z.object({
  teacherRoleId: z.string().min(1).nullable().optional(),
  levelRoleIds: z.record(z.string().min(1)).optional(),
  levelupChannelId: z.string().min(1).nullable().optional(),
});

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function wrap(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export const guildConfigRouter: IRouter = Router();

guildConfigRouter.get(
  '/:guildId',
  validate({ params: guildIdParam }),
  wrap(async (req, res) => {
    const data = await getGuildConfig(req.params['guildId'] as string);
    res.json({ success: true, data });
  }),
);

guildConfigRouter.delete(
  '/:guildId',
  validate({ params: guildIdParam }),
  wrap(async (req, res) => {
    const deleted = await deleteGuildConfig(req.params['guildId'] as string);
    res.json({ success: true, data: { deleted } });
  }),
);

guildConfigRouter.put(
  '/:guildId',
  validate({ params: guildIdParam, body: upsertBody }),
  wrap(async (req, res) => {
    const data = await upsertGuildConfig(
      req.params['guildId'] as string,
      req.body as z.infer<typeof upsertBody>,
    );
    res.json({ success: true, data });
  }),
);
