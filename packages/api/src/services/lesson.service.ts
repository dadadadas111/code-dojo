import mongoose from 'mongoose';
import type { Lesson, PaginationQuery, PaginatedResponse } from '@code-dojo/shared';
import { LessonModel } from '../db/models/lesson.model';
import { ConflictError, NotFoundError } from '../errors';
import { getActiveCourse } from './course.service';

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
    scheduledDate: Date;
    slideUrl?: string | null;
    recordingUrl?: string | null;
  },
): Promise<Lesson> {
  try {
    const doc = await LessonModel.create({ courseId, ...input });
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
