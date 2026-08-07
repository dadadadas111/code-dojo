import type { PaginatedResponse } from '@code-dojo/shared';
import { redis } from '../db/connection';
import { StudentModel } from '../db/models/student.model';
import { getStudentByDiscordId } from './student.service';

export type LeaderboardMetric = 'xp' | 'coins' | 'streak';

const LEADERBOARD_KEYS: Record<LeaderboardMetric, string> = {
  xp: 'leaderboard:xp',
  coins: 'leaderboard:coins',
  streak: 'leaderboard:streak',
};

const STUDENT_FIELD: Record<LeaderboardMetric, 'xp' | 'coins' | 'currentStreak'> = {
  xp: 'xp',
  coins: 'coins',
  streak: 'currentStreak',
};

const CHUNK_SIZE = 500;

/** Deletes only the leaderboard sorted sets — safe on a Redis shared with other apps. */
export async function clearLeaderboards(): Promise<void> {
  await redis.del(LEADERBOARD_KEYS.xp, LEADERBOARD_KEYS.coins, LEADERBOARD_KEYS.streak);
}

export interface LeaderboardEntry {
  rank: number;
  studentId: string;
  displayName: string;
  score: number;
}

export async function safeZAdd(
  metric: LeaderboardMetric,
  studentId: string,
  score: number,
): Promise<void> {
  try {
    await redis.zadd(LEADERBOARD_KEYS[metric], score, studentId);
  } catch (e) {
    console.error('[Leaderboard] ZADD failed', e);
  }
}

export async function rebuildLeaderboards(): Promise<void> {
  try {
    const students = await StudentModel.find({}, '_id xp coins currentStreak');

    const pipeline = redis.pipeline();
    pipeline.del(LEADERBOARD_KEYS.xp, LEADERBOARD_KEYS.coins, LEADERBOARD_KEYS.streak);

    for (let i = 0; i < students.length; i += CHUNK_SIZE) {
      const chunk = students.slice(i, i + CHUNK_SIZE);
      for (const student of chunk) {
        const id = student._id.toString();
        pipeline.zadd(LEADERBOARD_KEYS.xp, student.xp, id);
        pipeline.zadd(LEADERBOARD_KEYS.coins, student.coins, id);
        pipeline.zadd(LEADERBOARD_KEYS.streak, student.currentStreak, id);
      }
    }

    await pipeline.exec();
  } catch (e) {
    console.error('[Leaderboard] rebuild failed', e);
  }
}

export async function getLeaderboard(
  metric: LeaderboardMetric,
  { page, limit }: { page?: number; limit?: number },
): Promise<PaginatedResponse<LeaderboardEntry>> {
  const safePage = Math.max(1, page ?? 1);
  const safeLimit = Math.min(100, Math.max(1, limit ?? 10));
  const start = (safePage - 1) * safeLimit;
  const key = LEADERBOARD_KEYS[metric];

  try {
    let total = await redis.zcard(key);
    if (total === 0) {
      await rebuildLeaderboards();
      total = await redis.zcard(key);
    }

    const raw = await redis.zrevrange(key, start, start + safeLimit - 1, 'WITHSCORES');

    const orderedIds: string[] = [];
    const scoreById = new Map<string, number>();
    for (let i = 0; i < raw.length; i += 2) {
      const id = raw[i] as string;
      const score = Number(raw[i + 1]);
      orderedIds.push(id);
      scoreById.set(id, score);
    }

    const students = await StudentModel.find({ _id: { $in: orderedIds } }, '_id displayName');
    const studentById = new Map(students.map((s) => [s._id.toString(), s.displayName]));

    const data: LeaderboardEntry[] = orderedIds.map((id, i) => ({
      rank: start + i + 1,
      studentId: id,
      displayName: studentById.get(id) ?? 'Unknown',
      score: scoreById.get(id) ?? 0,
    }));

    return {
      data,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  } catch (e) {
    console.error('[Leaderboard] Redis read failed, falling back to Mongo', e);
    const sortField = STUDENT_FIELD[metric];
    const [docs, total] = await Promise.all([
      StudentModel.find({}, '_id displayName ' + sortField)
        .sort({ [sortField]: -1 })
        .skip(start)
        .limit(safeLimit),
      StudentModel.countDocuments(),
    ]);

    const data: LeaderboardEntry[] = docs.map((doc, i) => ({
      rank: start + i + 1,
      studentId: doc._id.toString(),
      displayName: doc.displayName,
      score: doc[sortField],
    }));

    return {
      data,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }
}

export async function getRankByDiscordId(
  metric: LeaderboardMetric,
  discordId: string,
): Promise<{ rank: number; score: number; studentId: string; displayName: string }> {
  const student = await getStudentByDiscordId(discordId);
  const key = LEADERBOARD_KEYS[metric];
  const studentId = student.id;

  const resolveFromField = (): {
    rank: number;
    score: number;
    studentId: string;
    displayName: string;
  } => {
    const field = STUDENT_FIELD[metric];
    const score = student[field];
    return { rank: 0, score, studentId, displayName: student.displayName };
  };

  try {
    let rank0 = await redis.zrevrank(key, studentId);
    if (rank0 === null) {
      await rebuildLeaderboards();
      rank0 = await redis.zrevrank(key, studentId);
    }

    if (rank0 === null) {
      const field = STUDENT_FIELD[metric];
      const score = student[field];
      const higherCount = await StudentModel.countDocuments({ [field]: { $gt: score } });
      return {
        rank: higherCount + 1,
        score,
        studentId,
        displayName: student.displayName,
      };
    }

    const score = await redis.zscore(key, studentId);
    return {
      rank: rank0 + 1,
      score: score !== null ? Number(score) : resolveFromField().score,
      studentId,
      displayName: student.displayName,
    };
  } catch (e) {
    console.error('[Leaderboard] Redis rank lookup failed, falling back to Mongo', e);
    const field = STUDENT_FIELD[metric];
    const score = student[field];
    const higherCount = await StudentModel.countDocuments({ [field]: { $gt: score } });
    return {
      rank: higherCount + 1,
      score,
      studentId,
      displayName: student.displayName,
    };
  }
}
