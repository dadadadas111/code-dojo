import mongoose from 'mongoose';
import type {
  ActivityLog,
  ActivityType,
  PaginationQuery,
  PaginatedResponse,
} from '@code-dojo/shared';
import { ActivityLogModel } from '../db/models/activitylog.model';

const SORTABLE_FIELDS = new Set(['createdAt']);

function toActivityLog(doc: mongoose.Document): ActivityLog {
  return doc.toJSON() as unknown as ActivityLog;
}

export async function recordActivity(entry: {
  studentId: string;
  type: ActivityType;
  description: string;
  amount?: number | null;
  metadata?: Record<string, unknown>;
}): Promise<ActivityLog> {
  const doc = await ActivityLogModel.create({
    studentId: entry.studentId,
    type: entry.type,
    description: entry.description,
    amount: entry.amount ?? null,
    metadata: entry.metadata ?? {},
  });
  return toActivityLog(doc);
}

export async function listByStudent(
  studentId: string,
  query: PaginationQuery,
): Promise<PaginatedResponse<ActivityLog>> {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));
  const skip = (page - 1) * limit;

  const sortField =
    query.sort !== undefined && SORTABLE_FIELDS.has(query.sort) ? query.sort : 'createdAt';
  const sortOrder = query.order === 'asc' ? 1 : -1;

  const filter = { studentId };

  const [docs, total] = await Promise.all([
    ActivityLogModel.find(filter)
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit),
    ActivityLogModel.countDocuments(filter),
  ]);

  return {
    data: docs.map(toActivityLog),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function hasXpForSubmission(submissionId: string): Promise<boolean> {
  const doc = await ActivityLogModel.findOne({
    type: 'xp_earned',
    'metadata.submissionId': submissionId,
  });
  return doc !== null;
}
