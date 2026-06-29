import mongoose, { type Document, type Model } from 'mongoose';
import type { Course } from '@code-dojo/shared';

export interface CourseDocument extends Document {
  name: string;
  description: string;
  startDate: Date;
  endDate: Date | null;
  isActive: boolean;
}

const courseSchema = new mongoose.Schema<CourseDocument>(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>): Record<string, unknown> {
        ret['id'] = (ret['_id'] as mongoose.Types.ObjectId).toString();
        delete ret['_id'];
        delete ret['__v'];
        delete ret['updatedAt'];
        // createdAt is kept — Course interface exposes it
        return ret;
      },
    },
  },
);

courseSchema.index({ isActive: 1 });

export const CourseModel: Model<CourseDocument> = mongoose.model<CourseDocument>(
  'Course',
  courseSchema,
);

export type { Course };
