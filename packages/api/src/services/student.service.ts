import mongoose from 'mongoose';
import type { Student, PaginationQuery, PaginatedResponse } from '@code-dojo/shared';
import { StudentModel } from '../db/models/student.model';
import { ConflictError, NotFoundError } from '../errors';

const SORTABLE_FIELDS = new Set(['xp', 'level', 'coins', 'joinDate']);

function toStudent(doc: mongoose.Document): Student {
  return doc.toJSON() as unknown as Student;
}

export async function registerStudent(input: {
  discordId: string;
  displayName: string;
}): Promise<Student> {
  try {
    const doc = await StudentModel.create(input);
    return toStudent(doc);
  } catch (err: unknown) {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: number }).code === 11000
    ) {
      throw new ConflictError('Student already registered');
    }
    throw err;
  }
}

export async function listStudents(query: PaginationQuery): Promise<PaginatedResponse<Student>> {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));
  const skip = (page - 1) * limit;

  const sortField =
    query.sort !== undefined && SORTABLE_FIELDS.has(query.sort) ? query.sort : 'joinDate';
  const sortOrder = query.order === 'asc' ? 1 : -1;

  const [docs, total] = await Promise.all([
    StudentModel.find()
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit),
    StudentModel.countDocuments(),
  ]);

  return {
    data: docs.map(toStudent),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getStudentById(id: string): Promise<Student> {
  let doc: mongoose.Document | null;
  try {
    doc = await StudentModel.findById(id);
  } catch (err: unknown) {
    if (err instanceof mongoose.Error.CastError) {
      throw new NotFoundError('Student not found');
    }
    throw err;
  }

  if (doc === null) {
    throw new NotFoundError('Student not found');
  }

  return toStudent(doc);
}

export async function getStudentByDiscordId(discordId: string): Promise<Student> {
  const doc = await StudentModel.findOne({ discordId });
  if (doc === null) {
    throw new NotFoundError('Student not found');
  }
  return toStudent(doc);
}

export async function updateStudent(
  id: string,
  patch: { displayName?: string; isActive?: boolean },
): Promise<Student> {
  let doc: mongoose.Document | null;
  try {
    doc = await StudentModel.findByIdAndUpdate(id, { $set: patch }, { new: true });
  } catch (err: unknown) {
    if (err instanceof mongoose.Error.CastError) {
      throw new NotFoundError('Student not found');
    }
    throw err;
  }

  if (doc === null) {
    throw new NotFoundError('Student not found');
  }

  return toStudent(doc);
}
