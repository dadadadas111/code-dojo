import { StudentModel } from '../db/models/student.model';
import { NotFoundError } from '../errors';
import { recordActivity } from './activitylog.service';

export interface CoinAward {
  coinsAwarded: number;
  newBalance: number;
  discordId: string;
}

export async function awardCoins(input: {
  studentId: string;
  amount: number;
  description: string;
  metadata?: Record<string, unknown>;
}): Promise<CoinAward> {
  const student = await StudentModel.findByIdAndUpdate(
    input.studentId,
    { $inc: { coins: input.amount } },
    { new: true },
  );
  if (student === null) {
    throw new NotFoundError('Student not found');
  }

  await recordActivity({
    studentId: input.studentId,
    type: 'coin_earned',
    description: input.description,
    amount: input.amount,
    metadata: input.metadata ?? {},
  });

  return {
    coinsAwarded: input.amount,
    newBalance: student.coins,
    discordId: student.discordId,
  };
}
