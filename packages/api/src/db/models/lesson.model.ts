import mongoose, { type Document, type Model } from 'mongoose';
import type { Lesson } from '@code-dojo/shared';

export interface LessonDocument extends Document {
  courseId: string;
  order: number;
  topic: string;
  description: string;
  slideUrl: string | null;
  recordingUrl: string | null;
  scheduledDate: Date;
}

const lessonSchema = new mongoose.Schema<LessonDocument>(
  {
    courseId: { type: String, required: true, index: true },
    order: { type: Number, required: true },
    topic: { type: String, required: true },
    description: { type: String, required: true },
    slideUrl: { type: String, default: null },
    recordingUrl: { type: String, default: null },
    scheduledDate: { type: Date, required: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>): Record<string, unknown> {
        ret['id'] = (ret['_id'] as mongoose.Types.ObjectId).toString();
        delete ret['_id'];
        delete ret['__v'];
        delete ret['createdAt'];
        delete ret['updatedAt'];
        // courseId stays as plain string — no transform needed
        return ret;
      },
    },
  },
);

lessonSchema.index({ courseId: 1, scheduledDate: 1 });
lessonSchema.index({ courseId: 1, order: 1 }, { unique: true });

export const LessonModel: Model<LessonDocument> = mongoose.model<LessonDocument>(
  'Lesson',
  lessonSchema,
);

export type { Lesson };
