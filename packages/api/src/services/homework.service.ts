import mongoose from 'mongoose';
import type { Homework, HomeworkType, PaginationQuery, PaginatedResponse } from '@code-dojo/shared';
import { HomeworkModel } from '../db/models/homework.model';
import { NotFoundError } from '../errors';
import { getActiveCourse } from './course.service';

const SORTABLE_FIELDS = new Set(['deadline', 'title', 'createdAt']);

function toHomework(doc: mongoose.Document): Homework {
  return doc.toJSON() as unknown as Homework;
}

export async function createHomework(
  courseId: string,
  input: {
    title: string;
    description: string;
    type: HomeworkType;
    deadline: Date;
    xpReward?: number;
    coinReward?: number;
    maxScore?: number;
    lessonId?: string | null;
    isActive?: boolean;
  },
): Promise<Homework> {
  const doc = await HomeworkModel.create({ courseId, ...input });
  return toHomework(doc);
}

export async function listHomeworkForCourse(
  courseId: string,
  query: PaginationQuery,
): Promise<PaginatedResponse<Homework>> {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));
  const skip = (page - 1) * limit;

  const sortField =
    query.sort !== undefined && SORTABLE_FIELDS.has(query.sort) ? query.sort : 'deadline';
  const sortOrder = query.order === 'desc' ? -1 : 1;

  const [docs, total] = await Promise.all([
    HomeworkModel.find({ courseId })
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit),
    HomeworkModel.countDocuments({ courseId }),
  ]);

  return {
    data: docs.map(toHomework),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getHomeworkById(id: string): Promise<Homework> {
  let doc: mongoose.Document | null;
  try {
    doc = await HomeworkModel.findById(id);
  } catch (err: unknown) {
    if (err instanceof mongoose.Error.CastError) {
      throw new NotFoundError('Homework not found');
    }
    throw err;
  }

  if (doc === null) {
    throw new NotFoundError('Homework not found');
  }

  return toHomework(doc);
}

export async function getHomeworkForActiveCourse(
  query: PaginationQuery,
): Promise<PaginatedResponse<Homework>> {
  const course = await getActiveCourse();
  return listHomeworkForCourse(course.id, query);
}

export async function updateHomework(
  courseId: string,
  id: string,
  patch: {
    title?: string;
    description?: string;
    type?: HomeworkType;
    deadline?: Date;
    xpReward?: number;
    coinReward?: number;
    maxScore?: number;
    lessonId?: string | null;
    isActive?: boolean;
  },
): Promise<Homework> {
  // Verify homework exists and belongs to course first
  const existing = await getHomeworkById(id);
  if (existing.courseId !== courseId) {
    throw new NotFoundError('Homework not found');
  }

  const allowed: Record<string, unknown> = {};
  if (patch.title !== undefined) allowed['title'] = patch.title;
  if (patch.description !== undefined) allowed['description'] = patch.description;
  if (patch.type !== undefined) allowed['type'] = patch.type;
  if (patch.deadline !== undefined) allowed['deadline'] = patch.deadline;
  if (patch.xpReward !== undefined) allowed['xpReward'] = patch.xpReward;
  if (patch.coinReward !== undefined) allowed['coinReward'] = patch.coinReward;
  if (patch.maxScore !== undefined) allowed['maxScore'] = patch.maxScore;
  if ('lessonId' in patch) allowed['lessonId'] = patch.lessonId;
  if (patch.isActive !== undefined) allowed['isActive'] = patch.isActive;

  let doc: mongoose.Document | null;
  try {
    doc = await HomeworkModel.findByIdAndUpdate(id, { $set: allowed }, { new: true });
  } catch (err: unknown) {
    if (err instanceof mongoose.Error.CastError) {
      throw new NotFoundError('Homework not found');
    }
    throw err;
  }

  if (doc === null) {
    throw new NotFoundError('Homework not found');
  }

  return toHomework(doc);
}
