import mongoose, { type Document, type Model } from 'mongoose';
import type { Homework, HomeworkSource, HomeworkType } from '@code-dojo/shared';

const HOMEWORK_TYPES: HomeworkType[] = ['quiz', 'coding', 'reading', 'practice', 'challenge'];

export interface HomeworkDocument extends Document {
  courseId: string;
  lessonId: string | null;
  title: string;
  description: string;
  type: HomeworkType;
  deadline: Date;
  xpReward: number;
  coinReward: number;
  maxScore: number;
  isActive: boolean;
  source: HomeworkSource;
}

const homeworkSchema = new mongoose.Schema<HomeworkDocument>(
  {
    courseId: { type: String, required: true, index: true },
    lessonId: { type: String, default: null },
    title: { type: String, required: true },
    description: { type: String, required: true },
    type: { type: String, enum: HOMEWORK_TYPES, required: true },
    deadline: { type: Date, required: true },
    xpReward: { type: Number, default: 0 },
    coinReward: { type: Number, default: 0 },
    maxScore: { type: Number, default: 100 },
    isActive: { type: Boolean, default: true },
    // { type: 'manual'|'leetcode', slug?, difficulty?, url? } — set by the leetcode import path.
    source: { type: mongoose.Schema.Types.Mixed, default: { type: 'manual' } },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>): Record<string, unknown> {
        ret['id'] = (ret['_id'] as mongoose.Types.ObjectId).toString();
        delete ret['_id'];
        delete ret['__v'];
        delete ret['updatedAt'];
        // createdAt is kept — Homework interface exposes it
        return ret;
      },
    },
  },
);

homeworkSchema.index({ courseId: 1, isActive: 1 });
homeworkSchema.index({ courseId: 1, deadline: 1 });

export const HomeworkModel: Model<HomeworkDocument> = mongoose.model<HomeworkDocument>(
  'Homework',
  homeworkSchema,
);

export type { Homework };
