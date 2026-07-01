import mongoose, { type Document, type Model } from 'mongoose';
import type { Attendance, AttendanceStatus } from '@code-dojo/shared';

const ATTENDANCE_STATUSES: AttendanceStatus[] = ['present', 'late', 'absent'];

export interface AttendanceDocument extends Document {
  lessonId: string;
  studentId: string;
  status: AttendanceStatus;
  checkinTime: Date | null;
}

const attendanceSchema = new mongoose.Schema<AttendanceDocument>(
  {
    lessonId: { type: String, required: true, index: true },
    studentId: { type: String, required: true, index: true },
    status: { type: String, enum: ATTENDANCE_STATUSES, required: true },
    checkinTime: { type: Date, default: null },
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

attendanceSchema.index({ lessonId: 1, studentId: 1 }, { unique: true });

export const AttendanceModel: Model<AttendanceDocument> = mongoose.model<AttendanceDocument>(
  'Attendance',
  attendanceSchema,
);

export type { Attendance };
