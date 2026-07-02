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
  getLeaderboard,
  getRankByDiscordId,
  rebuildLeaderboards,
  type LeaderboardMetric,
} from '../services/leaderboard.service';

const metricParam = z.object({ metric: z.enum(['xp', 'coins', 'streak']) });

const paginationQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

const rankQuery = z.object({ discordId: z.string().min(1) });

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function wrap(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export const gamificationRouter: IRouter = Router();

gamificationRouter.get(
  '/leaderboard/:metric',
  validate({ params: metricParam, query: paginationQuery }),
  wrap(async (req, res) => {
    const { metric } = req.params as unknown as z.infer<typeof metricParam>;
    const { page, limit } = req.query as unknown as z.infer<typeof paginationQuery>;
    const data = await getLeaderboard(metric as LeaderboardMetric, { page, limit });
    res.json({ success: true, data });
  }),
);

gamificationRouter.get(
  '/leaderboard/:metric/rank',
  validate({ params: metricParam, query: rankQuery }),
  wrap(async (req, res) => {
    const { metric } = req.params as unknown as z.infer<typeof metricParam>;
    const { discordId } = req.query as unknown as z.infer<typeof rankQuery>;
    const data = await getRankByDiscordId(metric as LeaderboardMetric, discordId);
    res.json({ success: true, data });
  }),
);

gamificationRouter.post(
  '/leaderboard/rebuild',
  requireTeacher,
  wrap(async (_req, res) => {
    await rebuildLeaderboards();
    res.json({ success: true, data: { rebuilt: true } });
  }),
);
