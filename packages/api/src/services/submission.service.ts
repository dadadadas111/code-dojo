import mongoose from 'mongoose';
import type {
  PaginationQuery,
  PaginatedResponse,
  Submission,
  SubmissionStatus,
} from '@code-dojo/shared';
import { XP_REWARDS } from '@code-dojo/shared';
import { SubmissionModel } from '../db/models/submission.model';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors';
import { getStudentByDiscordId } from './student.service';
import { getHomeworkById } from './homework.service';
import { hasXpForSubmission } from './activitylog.service';
import { awardXp, type XpAward } from './xp.service';

const SORTABLE_FIELDS = new Set(['submittedAt']);

// pending|late are the pre-grade states; grading is in-review; accepted/revision are
// graded outcomes that can still be re-graded (regrade is intentionally unrestricted).
// The grade route's zod schema already limits the target to grading|accepted|revision,
// so assertTransition() cannot 409 via that route today — it guards direct service
// callers and future schema widening. The reachable 409 lives on the resubmit path,
// which only allows revision -> pending|late.
const ALLOWED_TRANSITIONS: Record<SubmissionStatus, Set<SubmissionStatus>> = {
  pending: new Set(['grading', 'accepted', 'revision']),
  late: new Set(['grading', 'accepted', 'revision']),
  grading: new Set(['grading', 'accepted', 'revision']),
  accepted: new Set(['grading', 'accepted', 'revision']),
  revision: new Set(['grading', 'accepted', 'revision']),
};

function toSubmission(doc: mongoose.Document): Submission {
  return doc.toJSON() as unknown as Submission;
}

export function assertTransition(from: SubmissionStatus, to: SubmissionStatus): void {
  if (!ALLOWED_TRANSITIONS[from].has(to)) {
    throw new ConflictError(`Cannot move submission from ${from} to ${to}`);
  }
}

export async function createSubmission(input: {
  discordId: string;
  homeworkId: string;
  content?: string;
  githubLink?: string;
  fileUrl?: string;
}): Promise<Submission> {
  const student = await getStudentByDiscordId(input.discordId);
  const homework = await getHomeworkById(input.homeworkId);

  if (
    input.content === undefined &&
    input.githubLink === undefined &&
    input.fileUrl === undefined
  ) {
    throw new ValidationError('At least one of content, githubLink, or fileUrl is required');
  }

  const status: SubmissionStatus = Date.now() > homework.deadline.getTime() ? 'late' : 'pending';

  try {
    const doc = await SubmissionModel.create({
      homeworkId: homework.id,
      studentId: student.id,
      content: input.content ?? null,
      githubLink: input.githubLink ?? null,
      fileUrl: input.fileUrl ?? null,
      status,
    });
    return toSubmission(doc);
  } catch (err: unknown) {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: number }).code === 11000
    ) {
      throw new ConflictError('You have already submitted this homework');
    }
    throw err;
  }
}

export async function gradeSubmission(
  id: string,
  patch: { status: 'grading' | 'accepted' | 'revision'; score?: number; feedback?: string },
): Promise<{ submission: Submission; xp: XpAward | null }> {
  const submission = await getSubmissionById(id);
  assertTransition(submission.status, patch.status);

  const homework = await getHomeworkById(submission.homeworkId);
  if (patch.score !== undefined) {
    if (patch.score < 0 || patch.score > homework.maxScore) {
      throw new ValidationError(`Score must be between 0 and ${homework.maxScore}`);
    }
  }

  const allowed: Record<string, unknown> = {
    status: patch.status,
    gradedAt: new Date(),
  };
  if (patch.score !== undefined) allowed['score'] = patch.score;
  if (patch.feedback !== undefined) allowed['feedback'] = patch.feedback;

  let doc: mongoose.Document | null;
  try {
    doc = await SubmissionModel.findByIdAndUpdate(id, { $set: allowed }, { new: true });
  } catch (err: unknown) {
    if (err instanceof mongoose.Error.CastError) {
      throw new NotFoundError('Submission not found');
    }
    throw err;
  }

  if (doc === null) {
    throw new NotFoundError('Submission not found');
  }

  const graded = toSubmission(doc);

  let xp: XpAward | null = null;
  if (graded.status === 'accepted' && !(await hasXpForSubmission(id))) {
    const early = graded.submittedAt.getTime() <= homework.deadline.getTime();
    const amount = homework.xpReward + (early ? XP_REWARDS.homework_early : 0);
    // A homework may carry xpReward 0; only award (and log) when there's XP to give.
    if (amount > 0) {
      xp = await awardXp({
        studentId: graded.studentId,
        amount,
        description: `Hoàn thành bài tập: ${homework.title}`,
        metadata: { submissionId: id, homeworkId: homework.id, early },
      });
    }
  }

  return { submission: graded, xp };
}

export async function resubmitSubmission(
  id: string,
  input: { discordId: string; content?: string; githubLink?: string; fileUrl?: string },
): Promise<Submission> {
  const submission = await getSubmissionById(id);
  const student = await getStudentByDiscordId(input.discordId);

  if (submission.studentId !== student.id) {
    throw new ForbiddenError('You may only resubmit your own homework');
  }

  if (submission.status !== 'revision') {
    throw new ConflictError('Only submissions marked for revision can be resubmitted');
  }

  if (
    input.content === undefined &&
    input.githubLink === undefined &&
    input.fileUrl === undefined
  ) {
    throw new ValidationError('At least one of content, githubLink, or fileUrl is required');
  }

  const homework = await getHomeworkById(submission.homeworkId);
  const status: SubmissionStatus = Date.now() > homework.deadline.getTime() ? 'late' : 'pending';

  const allowed: Record<string, unknown> = {
    status,
    score: null,
    feedback: null,
    gradedAt: null,
    submittedAt: new Date(),
  };
  if (input.content !== undefined) allowed['content'] = input.content;
  if (input.githubLink !== undefined) allowed['githubLink'] = input.githubLink;
  if (input.fileUrl !== undefined) allowed['fileUrl'] = input.fileUrl;

  const doc = await SubmissionModel.findByIdAndUpdate(id, { $set: allowed }, { new: true });
  if (doc === null) {
    throw new NotFoundError('Submission not found');
  }

  return toSubmission(doc);
}

export async function getSubmissionById(id: string): Promise<Submission> {
  let doc: mongoose.Document | null;
  try {
    doc = await SubmissionModel.findById(id);
  } catch (err: unknown) {
    if (err instanceof mongoose.Error.CastError) {
      throw new NotFoundError('Submission not found');
    }
    throw err;
  }

  if (doc === null) {
    throw new NotFoundError('Submission not found');
  }

  return toSubmission(doc);
}

export async function listSubmissions(
  query: PaginationQuery & { homeworkId?: string; status?: SubmissionStatus; discordId?: string },
): Promise<PaginatedResponse<Submission>> {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));
  const skip = (page - 1) * limit;

  const sortField =
    query.sort !== undefined && SORTABLE_FIELDS.has(query.sort) ? query.sort : 'submittedAt';
  const sortOrder = query.order === 'asc' ? 1 : -1;

  const filter: Record<string, unknown> = {};
  if (query.homeworkId !== undefined) filter['homeworkId'] = query.homeworkId;
  if (query.status !== undefined) filter['status'] = query.status;
  if (query.discordId !== undefined) {
    const student = await getStudentByDiscordId(query.discordId);
    filter['studentId'] = student.id;
  }

  const [docs, total] = await Promise.all([
    SubmissionModel.find(filter)
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit),
    SubmissionModel.countDocuments(filter),
  ]);

  return {
    data: docs.map(toSubmission),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}
