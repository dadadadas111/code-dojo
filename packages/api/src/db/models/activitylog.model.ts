import mongoose, { type Document, type Model } from 'mongoose';
import type { ActivityLog, ActivityType } from '@code-dojo/shared';

const ACTIVITY_TYPES: ActivityType[] = [
  'xp_earned',
  'coin_earned',
  'coin_spent',
  'level_up',
  'achievement_earned',
  'submission_created',
  'submission_graded',
  'attendance_checked',
  'streak_updated',
  'item_purchased',
];

export interface ActivityLogDocument extends Document {
  studentId: string;
  type: ActivityType;
  description: string;
  amount: number | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

const activityLogSchema = new mongoose.Schema<ActivityLogDocument>(
  {
    studentId: { type: String, required: true, index: true },
    type: { type: String, enum: ACTIVITY_TYPES, required: true },
    description: { type: String, required: true },
    amount: { type: Number, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>): Record<string, unknown> {
        ret['id'] = (ret['_id'] as mongoose.Types.ObjectId).toString();
        delete ret['_id'];
        delete ret['__v'];
        // createdAt is kept — ActivityLog interface exposes it
        delete ret['updatedAt'];
        return ret;
      },
    },
  },
);

activityLogSchema.index({ studentId: 1, type: 1 });
activityLogSchema.index({ 'metadata.submissionId': 1 });

export const ActivityLogModel: Model<ActivityLogDocument> = mongoose.model<ActivityLogDocument>(
  'ActivityLog',
  activityLogSchema,
);

export type { ActivityLog };
