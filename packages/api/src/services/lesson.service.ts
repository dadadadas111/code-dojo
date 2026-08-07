import mongoose from 'mongoose';
import type { Lesson, PaginationQuery, PaginatedResponse } from '@code-dojo/shared';
import { LessonModel } from '../db/models/lesson.model';
import { ConflictError, NotFoundError } from '../errors';
import { getActiveCourse } from './course.service';
import { assignNextSlotDate } from './schedule.service';

const SORTABLE_FIELDS = new Set(['order', 'scheduledDate', 'topic']);

function toLesson(doc: mongoose.Document): Lesson {
  return doc.toJSON() as unknown as Lesson;
}

export async function createLesson(
  courseId: string,
  input: {
    order: number;
    topic: string;
    description: string;
    scheduledDate?: Date;
    slideUrl?: string | null;
    recordingUrl?: string | null;
  },
): Promise<Lesson> {
  // No explicit date -> snap onto the course's next free recurring slot.
  const scheduledDate = input.scheduledDate ?? (await assignNextSlotDate(courseId));
  try {
    const doc = await LessonModel.create({ courseId, ...input, scheduledDate });
    return toLesson(doc);
  } catch (err: unknown) {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: number }).code === 11000
    ) {
      throw new ConflictError('A lesson with that order already exists in this course');
    }
    throw err;
  }
}

export async function listLessonsForCourse(
  courseId: string,
  query: PaginationQuery,
): Promise<PaginatedResponse<Lesson>> {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));
  const skip = (page - 1) * limit;

  const sortField =
    query.sort !== undefined && SORTABLE_FIELDS.has(query.sort) ? query.sort : 'order';
  const sortOrder = query.order === 'desc' ? -1 : 1;

  const [docs, total] = await Promise.all([
    LessonModel.find({ courseId })
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit),
    LessonModel.countDocuments({ courseId }),
  ]);

  return {
    data: docs.map(toLesson),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getLessonById(courseId: string, id: string): Promise<Lesson> {
  let doc: mongoose.Document | null;
  try {
    doc = await LessonModel.findById(id);
  } catch (err: unknown) {
    if (err instanceof mongoose.Error.CastError) {
      throw new NotFoundError('Lesson not found');
    }
    throw err;
  }

  if (doc === null) {
    throw new NotFoundError('Lesson not found');
  }

  // Verify the lesson belongs to the expected course
  const lesson = toLesson(doc);
  if (lesson.courseId !== courseId) {
    throw new NotFoundError('Lesson not found');
  }

  return lesson;
}

export async function updateLesson(
  courseId: string,
  id: string,
  patch: {
    order?: number;
    topic?: string;
    description?: string;
    scheduledDate?: Date;
    slideUrl?: string | null;
    recordingUrl?: string | null;
  },
): Promise<Lesson> {
  // Verify lesson exists and belongs to course first
  await getLessonById(courseId, id);

  const allowed: Record<string, unknown> = {};
  if (patch.order !== undefined) allowed['order'] = patch.order;
  if (patch.topic !== undefined) allowed['topic'] = patch.topic;
  if (patch.description !== undefined) allowed['description'] = patch.description;
  if (patch.scheduledDate !== undefined) allowed['scheduledDate'] = patch.scheduledDate;
  if ('slideUrl' in patch) allowed['slideUrl'] = patch.slideUrl;
  if ('recordingUrl' in patch) allowed['recordingUrl'] = patch.recordingUrl;

  let doc: mongoose.Document | null;
  try {
    doc = await LessonModel.findByIdAndUpdate(id, { $set: allowed }, { new: true });
  } catch (err: unknown) {
    if (err instanceof mongoose.Error.CastError) {
      throw new NotFoundError('Lesson not found');
    }
    throw err;
  }

  if (doc === null) {
    throw new NotFoundError('Lesson not found');
  }

  return toLesson(doc);
}

export async function getNextLessonForActiveCourse(): Promise<Lesson> {
  const course = await getActiveCourse();

  const doc = await LessonModel.findOne({
    courseId: course.id,
    scheduledDate: { $gte: new Date() },
  }).sort({ scheduledDate: 1 });

  if (doc === null) {
    throw new NotFoundError('No upcoming lesson found');
  }

  return toLesson(doc);
}

const ICT_TIME_ZONE = 'Asia/Ho_Chi_Minh';

// Formats `date` as y/m/d/h/m/s components as observed in the given IANA time zone.
function getZonedParts(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

// Computes the UTC instants corresponding to 00:00:00.000 and 23:59:59.999 of `date`'s
// calendar day *as observed in `timeZone`*. Naive `new Date()` day math uses the server's
// local TZ, which drifts from ICT — this instead reads the zoned y/m/d, then corrects for
// the zone's UTC offset (derived by comparing the zoned wall-clock reading to `date` itself).
function getZonedDayBoundsUtc(date: Date, timeZone: string): { startUtc: Date; endUtc: Date } {
  const zoned = getZonedParts(date, timeZone);
  // Wall-clock time in the zone, interpreted as if it were UTC.
  const asIfUtcMs = Date.UTC(
    zoned.year,
    zoned.month - 1,
    zoned.day,
    zoned.hour,
    zoned.minute,
    zoned.second,
  );
  const offsetMs = asIfUtcMs - date.getTime();

  const startAsIfUtc = Date.UTC(zoned.year, zoned.month - 1, zoned.day, 0, 0, 0, 0);
  const endAsIfUtc = Date.UTC(zoned.year, zoned.month - 1, zoned.day, 23, 59, 59, 999);

  return {
    startUtc: new Date(startAsIfUtc - offsetMs),
    endUtc: new Date(endAsIfUtc - offsetMs),
  };
}

export async function getCurrentLessonForActiveCourse(): Promise<Lesson> {
  const course = await getActiveCourse();

  const { startUtc, endUtc } = getZonedDayBoundsUtc(new Date(), ICT_TIME_ZONE);

  const doc = await LessonModel.findOne({
    courseId: course.id,
    scheduledDate: { $gte: startUtc, $lte: endUtc },
  }).sort({ scheduledDate: 1 });

  if (doc === null) {
    throw new NotFoundError('No lesson scheduled today');
  }

  return toLesson(doc);
}
