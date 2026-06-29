import mongoose, { type Document, type Model } from 'mongoose';
import type { Student } from '@code-dojo/shared';

export interface StudentDocument extends Document {
  discordId: string;
  displayName: string;
  level: number;
  xp: number;
  coins: number;
  currentStreak: number;
  maxStreak: number;
  isActive: boolean;
  joinDate: Date;
}

const studentSchema = new mongoose.Schema<StudentDocument>(
  {
    discordId: { type: String, required: true, unique: true },
    displayName: { type: String, required: true },
    level: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    coins: { type: Number, default: 0 },
    currentStreak: { type: Number, default: 0 },
    maxStreak: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    joinDate: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>): Record<string, unknown> {
        ret['id'] = (ret['_id'] as mongoose.Types.ObjectId).toString();
        delete ret['_id'];
        delete ret['__v'];
        // Mongoose timestamps are bookkeeping, not part of the Student contract.
        delete ret['createdAt'];
        delete ret['updatedAt'];
        return ret;
      },
    },
  },
);

studentSchema.index({ level: -1 });

export const StudentModel: Model<StudentDocument> = mongoose.model<StudentDocument>(
  'Student',
  studentSchema,
);

export type { Student };
