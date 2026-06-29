import mongoose from 'mongoose';
import type { Course, PaginationQuery, PaginatedResponse } from '@code-dojo/shared';
import { CourseModel } from '../db/models/course.model';
import { NotFoundError } from '../errors';

const SORTABLE_FIELDS = new Set(['startDate', 'name', 'createdAt']);

function toCourse(doc: mongoose.Document): Course {
  return doc.toJSON() as unknown as Course;
}

export async function createCourse(input: {
  name: string;
  description: string;
  startDate: Date;
  endDate?: Date | null;
  isActive?: boolean;
}): Promise<Course> {
  // Course has no unique fields, so create cannot raise a dup-key error.
  const doc = await CourseModel.create(input);
  return toCourse(doc);
}

export async function listCourses(
  query: PaginationQuery & { isActive?: boolean },
): Promise<PaginatedResponse<Course>> {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));
  const skip = (page - 1) * limit;

  const sortField =
    query.sort !== undefined && SORTABLE_FIELDS.has(query.sort) ? query.sort : 'startDate';
  const sortOrder = query.order === 'asc' ? 1 : -1;

  const filter: Record<string, unknown> = {};
  if (query.isActive !== undefined) {
    filter['isActive'] = query.isActive;
  }

  const [docs, total] = await Promise.all([
    CourseModel.find(filter)
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit),
    CourseModel.countDocuments(filter),
  ]);

  return {
    data: docs.map(toCourse),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getCourseById(id: string): Promise<Course> {
  let doc: mongoose.Document | null;
  try {
    doc = await CourseModel.findById(id);
  } catch (err: unknown) {
    if (err instanceof mongoose.Error.CastError) {
      throw new NotFoundError('Course not found');
    }
    throw err;
  }

  if (doc === null) {
    throw new NotFoundError('Course not found');
  }

  return toCourse(doc);
}

export async function getActiveCourse(): Promise<Course> {
  const doc = await CourseModel.findOne({ isActive: true }).sort({ startDate: -1 });

  if (doc === null) {
    throw new NotFoundError('No active course');
  }

  return toCourse(doc);
}

export async function updateCourse(
  id: string,
  patch: {
    name?: string;
    description?: string;
    startDate?: Date;
    endDate?: Date | null;
    isActive?: boolean;
  },
): Promise<Course> {
  const allowed: Record<string, unknown> = {};
  if (patch.name !== undefined) allowed['name'] = patch.name;
  if (patch.description !== undefined) allowed['description'] = patch.description;
  if (patch.startDate !== undefined) allowed['startDate'] = patch.startDate;
  if ('endDate' in patch) allowed['endDate'] = patch.endDate;
  if (patch.isActive !== undefined) allowed['isActive'] = patch.isActive;

  let doc: mongoose.Document | null;
  try {
    doc = await CourseModel.findByIdAndUpdate(id, { $set: allowed }, { new: true });
  } catch (err: unknown) {
    if (err instanceof mongoose.Error.CastError) {
      throw new NotFoundError('Course not found');
    }
    throw err;
  }

  if (doc === null) {
    throw new NotFoundError('Course not found');
  }

  return toCourse(doc);
}
