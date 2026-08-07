import type { Model } from 'mongoose';
import { StudentModel } from '../db/models/student.model';
import { CourseModel } from '../db/models/course.model';
import { LessonModel } from '../db/models/lesson.model';
import { HomeworkModel } from '../db/models/homework.model';
import { SubmissionModel } from '../db/models/submission.model';
import { AttendanceModel } from '../db/models/attendance.model';
import { ActivityLogModel } from '../db/models/activitylog.model';
import { clearLeaderboards } from './leaderboard.service';

/**
 * Wipes ALL class data (dev/testing utility, triggered by the bot's /reset).
 * Guild config is intentionally left alone — that belongs to /uninstall.
 * Returns deleted-document counts per collection.
 */
export async function resetAllData(): Promise<Record<string, number>> {
  const targets = {
    students: StudentModel,
    courses: CourseModel,
    lessons: LessonModel,
    homeworks: HomeworkModel,
    submissions: SubmissionModel,
    attendances: AttendanceModel,
    activityLogs: ActivityLogModel,
  } as const;

  const deleted: Record<string, number> = {};
  // Cast: deleteMany isn't callable on a union of differently-typed models.
  for (const [name, model] of Object.entries(targets) as Array<[string, Model<unknown>]>) {
    const res = await model.deleteMany({});
    deleted[name] = res.deletedCount ?? 0;
  }

  await clearLeaderboards();
  return deleted;
}
