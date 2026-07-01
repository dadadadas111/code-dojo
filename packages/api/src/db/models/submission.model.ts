import mongoose, { type Document, type Model } from 'mongoose';
import type { Submission, SubmissionStatus } from '@code-dojo/shared';

const SUBMISSION_STATUSES: SubmissionStatus[] = [
  'pending',
  'grading',
  'accepted',
  'revision',
  'late',
];

export interface SubmissionDocument extends Document {
  homeworkId: string;
  studentId: string;
  content: string | null;
  githubLink: string | null;
  fileUrl: string | null;
  submittedAt: Date;
  status: SubmissionStatus;
  score: number | null;
  feedback: string | null;
  gradedAt: Date | null;
}

const submissionSchema = new mongoose.Schema<SubmissionDocument>(
  {
    homeworkId: { type: String, required: true, index: true },
    studentId: { type: String, required: true, index: true },
    content: { type: String, default: null },
    githubLink: { type: String, default: null },
    fileUrl: { type: String, default: null },
    submittedAt: { type: Date, default: Date.now },
    status: { type: String, enum: SUBMISSION_STATUSES, default: 'pending' },
    score: { type: Number, default: null },
    feedback: { type: String, default: null },
    gradedAt: { type: Date, default: null },
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
        return ret;
      },
    },
  },
);

submissionSchema.index({ homeworkId: 1, studentId: 1 }, { unique: true });

export const SubmissionModel: Model<SubmissionDocument> = mongoose.model<SubmissionDocument>(
  'Submission',
  submissionSchema,
);

export type { Submission };
