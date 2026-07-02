import { getLevelFromXp } from '@code-dojo/shared';
import { StudentModel } from '../db/models/student.model';
import { NotFoundError } from '../errors';
import { recordActivity } from './activitylog.service';
import { safeZAdd } from './leaderboard.service';

export interface XpAward {
  xpAwarded: number;
  newXp: number;
  leveledUp: boolean;
  newLevel: number;
  newTitle: string;
  discordId: string;
}

export async function awardXp(input: {
  studentId: string;
  amount: number;
  description: string;
  metadata?: Record<string, unknown>;
}): Promise<XpAward> {
  const student = await StudentModel.findByIdAndUpdate(
    input.studentId,
    { $inc: { xp: input.amount } },
    { new: true },
  );
  if (student === null) {
    throw new NotFoundError('Student not found');
  }

  const { level: newLevel, title: newTitle } = getLevelFromXp(student.xp);
  const leveledUp = newLevel > student.level;

  if (leveledUp) {
    const previousLevel = student.level;
    student.level = newLevel;
    await student.save();
    await recordActivity({
      studentId: input.studentId,
      type: 'level_up',
      description: `Đạt cấp ${newLevel} - ${newTitle}`,
      amount: newLevel,
      metadata: { previousLevel, newLevel, newTitle },
    });
  }

  await recordActivity({
    studentId: input.studentId,
    type: 'xp_earned',
    description: input.description,
    amount: input.amount,
    metadata: input.metadata ?? {},
  });

  await safeZAdd('xp', student.id, student.xp);

  return {
    xpAwarded: input.amount,
    newXp: student.xp,
    leveledUp,
    newLevel,
    newTitle,
    discordId: student.discordId,
  };
}
