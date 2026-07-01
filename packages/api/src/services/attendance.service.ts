import mongoose from 'mongoose';
import type { Attendance, AttendanceStatus } from '@code-dojo/shared';
import { XP_REWARDS } from '@code-dojo/shared';
import { AttendanceModel } from '../db/models/attendance.model';
import { LessonModel } from '../db/models/lesson.model';
import { ConflictError, NotFoundError } from '../errors';
import { getStudentByDiscordId } from './student.service';
import { getCurrentLessonForActiveCourse } from './lesson.service';
import { awardXp, type XpAward } from './xp.service';

const LATE_GRACE_PERIOD_MS = 10 * 60_000;

function toAttendance(doc: mongoose.Document): Attendance {
  return doc.toJSON() as unknown as Attendance;
}

export async function checkin(
  discordId: string,
): Promise<{ attendance: Attendance; xp: XpAward | null }> {
  const student = await getStudentByDiscordId(discordId);
  const lesson = await getCurrentLessonForActiveCourse();

  const checkinTime = new Date();
  const status: AttendanceStatus =
    checkinTime.getTime() <= lesson.scheduledDate.getTime() + LATE_GRACE_PERIOD_MS
      ? 'present'
      : 'late';

  let doc: mongoose.Document;
  try {
    doc = await AttendanceModel.create({
      lessonId: lesson.id,
      studentId: student.id,
      status,
      checkinTime,
    });
  } catch (err: unknown) {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: number }).code === 11000
    ) {
      throw new ConflictError('You have already checked in for this lesson');
    }
    throw err;
  }

  const attendance = toAttendance(doc);
  // NOTE: the attendance row is committed before awardXp. If awardXp throws, the
  // check-in persists but no XP is granted, and a retry 409s on the unique index —
  // i.e. this partial failure is NOT self-healing (single-process MVP trade-off).
  const xp = await awardXp({
    studentId: student.id,
    amount: XP_REWARDS.attend_class,
    description: 'Điểm danh buổi học',
    metadata: { lessonId: lesson.id, attendanceId: attendance.id },
  });

  return { attendance, xp };
}

export async function markAttendance(
  lessonId: string,
  discordId: string,
  status: AttendanceStatus,
): Promise<Attendance> {
  const student = await getStudentByDiscordId(discordId);

  let lessonDoc: mongoose.Document | null;
  try {
    lessonDoc = await LessonModel.findById(lessonId);
  } catch (err: unknown) {
    if (err instanceof mongoose.Error.CastError) {
      throw new NotFoundError('Lesson not found');
    }
    throw err;
  }
  if (lessonDoc === null) {
    throw new NotFoundError('Lesson not found');
  }

  // Teacher correction: must be able to flip an existing record (e.g. present -> absent),
  // so this upserts rather than relying on the unique-index create-then-409 pattern.
  // checkinTime is only stamped when a student is actually present/late and doesn't
  // already have one — so a correction never clobbers the original, and an 'absent'
  // mark never carries a contradictory check-in timestamp.
  const existing = await AttendanceModel.findOne({ lessonId, studentId: student.id });
  const update: Record<string, unknown> = { status };
  if (status !== 'absent' && (existing === null || existing.checkinTime === null)) {
    update['checkinTime'] = new Date();
  }

  const doc = await AttendanceModel.findOneAndUpdate(
    { lessonId, studentId: student.id },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return toAttendance(doc);
}

export async function listForLesson(lessonId: string): Promise<Attendance[]> {
  let lessonDoc: mongoose.Document | null;
  try {
    lessonDoc = await LessonModel.findById(lessonId);
  } catch (err: unknown) {
    if (err instanceof mongoose.Error.CastError) {
      throw new NotFoundError('Lesson not found');
    }
    throw err;
  }
  if (lessonDoc === null) {
    throw new NotFoundError('Lesson not found');
  }

  const docs = await AttendanceModel.find({ lessonId });
  return docs.map(toAttendance);
}

export async function listForStudentByDiscordId(discordId: string): Promise<Attendance[]> {
  const student = await getStudentByDiscordId(discordId);
  const docs = await AttendanceModel.find({ studentId: student.id }).sort({ createdAt: -1 });
  return docs.map(toAttendance);
}

export async function statsForLesson(
  lessonId: string,
): Promise<{ present: number; late: number; absent: number; total: number }> {
  // NOT roster-derived: counts are over existing Attendance records only. A student with
  // no record at all (never checked in, never marked) is not counted as absent here.
  const [present, late, absent] = await Promise.all([
    AttendanceModel.countDocuments({ lessonId, status: 'present' }),
    AttendanceModel.countDocuments({ lessonId, status: 'late' }),
    AttendanceModel.countDocuments({ lessonId, status: 'absent' }),
  ]);

  return { present, late, absent, total: present + late + absent };
}
