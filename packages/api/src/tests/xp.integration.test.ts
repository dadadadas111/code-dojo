/**
 * Integration tests for the XP & Level Engine (Phase 5).
 *
 * Setup notes:
 * - Env vars are injected in src/tests/setup.ts (loaded before any app module).
 * - Each test suite connects to MongoDB (code-dojo-test database).
 * - afterEach clears students, courses, homeworks, submissions, lessons,
 *   attendances, and activitylogs collections so tests are fully isolated.
 * - Homework xpReward values are chosen explicitly so level math is
 *   predictable: LEVEL_THRESHOLDS[2] = 300 xp.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import mongoose from 'mongoose';

import { getLevelFromXp } from '@code-dojo/shared';
import { createServer } from '../app';
import { CourseModel } from '../db/models/course.model';
import { HomeworkModel } from '../db/models/homework.model';
import { StudentModel } from '../db/models/student.model';
import { SubmissionModel } from '../db/models/submission.model';
import { LessonModel } from '../db/models/lesson.model';
import { AttendanceModel } from '../db/models/attendance.model';
import { ActivityLogModel } from '../db/models/activitylog.model';
import { awardXp } from '../services/xp.service';

const VALID_KEY = 'test-api-key-0123456789';
const AUTH = `Bearer ${VALID_KEY}`;
const TEACHER = { 'X-Teacher': 'true' };
const MONGO_URI = 'mongodb://localhost:27017/code-dojo-test';

const VALID_COURSE_BODY = {
  name: 'TypeScript Fundamentals',
  description: 'Learn TypeScript from scratch',
  startDate: '2025-01-01',
};

let app: Application;

beforeAll(async () => {
  await mongoose.connect(MONGO_URI);
  app = await createServer();
});

afterEach(async () => {
  await StudentModel.deleteMany({});
  await CourseModel.deleteMany({});
  await HomeworkModel.deleteMany({});
  await SubmissionModel.deleteMany({});
  await LessonModel.deleteMany({});
  await AttendanceModel.deleteMany({});
  await ActivityLogModel.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
});

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

function futureDate(daysFromNow = 30): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString();
}

function pastDate(daysAgo = 1): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

async function createCourse(overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await request(app)
    .post('/api/courses')
    .set('Authorization', AUTH)
    .set(TEACHER)
    .send({ ...VALID_COURSE_BODY, isActive: true, ...overrides });
  return (res.body.data as Record<string, unknown>)['id'] as string;
}

async function createHomeworkInCourse(
  courseId: string,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const res = await request(app)
    .post(`/api/courses/${courseId}/homework`)
    .set('Authorization', AUTH)
    .set(TEACHER)
    .send({
      title: 'Homework 1',
      description: 'Solve the exercises',
      type: 'coding',
      deadline: futureDate(),
      maxScore: 100,
      xpReward: 0,
      ...overrides,
    });
  return res.body.data as Record<string, unknown>;
}

async function registerStudent(discordId: string, displayName = 'Test Student'): Promise<string> {
  const res = await request(app)
    .post('/api/students')
    .set('Authorization', AUTH)
    .send({ discordId, displayName });
  return (res.body.data as Record<string, unknown>)['id'] as string;
}

async function getStudent(id: string): Promise<Record<string, unknown>> {
  const res = await request(app).get(`/api/students/${id}`).set('Authorization', AUTH);
  return res.body.data as Record<string, unknown>;
}

async function createSubmission(
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await request(app).post('/api/submissions').set('Authorization', AUTH).send(body);
  return { status: res.status, body: res.body as Record<string, unknown> };
}

async function gradeSubmission(
  id: string,
  patch: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await request(app)
    .patch(`/api/submissions/${id}`)
    .set('Authorization', AUTH)
    .set(TEACHER)
    .send(patch);
  return { status: res.status, body: res.body as Record<string, unknown> };
}

/** Seeds a course + registered student + homework, returns ids for convenience. */
async function seedBasics(
  homeworkOverrides: Record<string, unknown> = {},
): Promise<{ courseId: string; studentId: string; discordId: string; homeworkId: string }> {
  const courseId = await createCourse();
  const discordId = 'disc-xp-001';
  const studentId = await registerStudent(discordId);
  const homework = await createHomeworkInCourse(courseId, homeworkOverrides);
  return { courseId, studentId, discordId, homeworkId: homework['id'] as string };
}

async function getActivity(studentId: string, query = ''): Promise<Record<string, unknown>> {
  const res = await request(app)
    .get(`/api/students/${studentId}/activity${query}`)
    .set('Authorization', AUTH);
  return res.body.data as Record<string, unknown>;
}

async function createLesson(
  courseId: string,
  minutesFromNow: number,
  order = 1,
): Promise<Record<string, unknown>> {
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutesFromNow);
  const res = await request(app)
    .post(`/api/courses/${courseId}/lessons`)
    .set('Authorization', AUTH)
    .set(TEACHER)
    .send({
      order,
      topic: `Lesson ${order}`,
      description: 'A lesson scheduled for today',
      scheduledDate: d.toISOString(),
    });
  return res.body.data as Record<string, unknown>;
}

async function checkin(
  discordId: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await request(app)
    .post('/api/attendance/checkin')
    .set('Authorization', AUTH)
    .send({ discordId });
  return { status: res.status, body: res.body as Record<string, unknown> };
}

// ---------------------------------------------------------------------------
// 1. Homework XP on accept (early bonus)
// ---------------------------------------------------------------------------

describe('Grading a homework submission — XP award', () => {
  it('awards xpReward + early bonus when accepted before the deadline', async () => {
    const { studentId, discordId, homeworkId } = await seedBasics({
      xpReward: 100,
      deadline: futureDate(30),
    });
    const created = await createSubmission({ discordId, homeworkId, content: 'answer' });
    const id = (created.body['data'] as Record<string, unknown>)['id'] as string;

    const { status, body } = await gradeSubmission(id, { status: 'accepted', score: 90 });

    expect(status).toBe(200);
    const data = body['data'] as Record<string, unknown>;
    const xp = data['xp'] as Record<string, unknown>;
    expect(xp).not.toBeNull();
    expect(xp['xpAwarded']).toBe(130); // 100 + 30 early bonus
    expect(xp['leveledUp']).toBe(false);

    const student = await getStudent(studentId);
    expect(student['xp']).toBe(130);

    const activity = await getActivity(studentId);
    const entries = activity['data'] as Array<Record<string, unknown>>;
    const xpEntry = entries.find((e) => e['type'] === 'xp_earned');
    expect(xpEntry).toBeDefined();
    expect(xpEntry?.['amount']).toBe(130);
  });

  it('does not award the early bonus when the submission was late', async () => {
    const { studentId, discordId, homeworkId } = await seedBasics({
      xpReward: 100,
      deadline: pastDate(1),
    });
    const created = await createSubmission({ discordId, homeworkId, content: 'answer' });
    const createdData = created.body['data'] as Record<string, unknown>;
    expect(createdData['status']).toBe('late'); // sanity: submittedAt > deadline
    const id = createdData['id'] as string;

    const { status, body } = await gradeSubmission(id, { status: 'accepted', score: 80 });

    expect(status).toBe(200);
    const xp = (body['data'] as Record<string, unknown>)['xp'] as Record<string, unknown>;
    expect(xp['xpAwarded']).toBe(100); // no +30

    const student = await getStudent(studentId);
    expect(student['xp']).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// 2. Idempotency — no double award on regrade
// ---------------------------------------------------------------------------

describe('Grading idempotency — XP is only awarded once per submission', () => {
  it('does not re-award XP when accepted twice in a row', async () => {
    const { studentId, discordId, homeworkId } = await seedBasics({
      xpReward: 50,
      deadline: futureDate(30),
    });
    const created = await createSubmission({ discordId, homeworkId, content: 'answer' });
    const id = (created.body['data'] as Record<string, unknown>)['id'] as string;

    const first = await gradeSubmission(id, { status: 'accepted', score: 90 });
    expect((first.body['data'] as Record<string, unknown>)['xp']).not.toBeNull();

    const studentAfterFirst = await getStudent(studentId);
    const xpAfterFirst = studentAfterFirst['xp'];

    const second = await gradeSubmission(id, { status: 'accepted', score: 95 });
    expect(second.status).toBe(200);
    expect((second.body['data'] as Record<string, unknown>)['xp']).toBeNull();

    const studentAfterSecond = await getStudent(studentId);
    expect(studentAfterSecond['xp']).toBe(xpAfterFirst);

    const activity = await getActivity(studentId);
    const entries = activity['data'] as Array<Record<string, unknown>>;
    const xpEntries = entries.filter((e) => e['type'] === 'xp_earned');
    expect(xpEntries).toHaveLength(1);
  });

  it('does not re-award XP after accepted -> revision -> accepted', async () => {
    const { studentId, discordId, homeworkId } = await seedBasics({
      xpReward: 50,
      deadline: futureDate(30),
    });
    const created = await createSubmission({ discordId, homeworkId, content: 'answer' });
    const id = (created.body['data'] as Record<string, unknown>)['id'] as string;

    const accepted = await gradeSubmission(id, { status: 'accepted', score: 90 });
    expect((accepted.body['data'] as Record<string, unknown>)['xp']).not.toBeNull();

    const toRevision = await gradeSubmission(id, {
      status: 'revision',
      feedback: 'please redo',
    });
    expect((toRevision.body['data'] as Record<string, unknown>)['xp']).toBeNull();

    const reAccepted = await gradeSubmission(id, { status: 'accepted', score: 95 });
    expect((reAccepted.body['data'] as Record<string, unknown>)['xp']).toBeNull();

    const student = await getStudent(studentId);
    expect(student['xp']).toBe(80); // 50 + 30 early bonus, awarded exactly once

    const activity = await getActivity(studentId);
    const entries = activity['data'] as Array<Record<string, unknown>>;
    const xpEntries = entries.filter((e) => e['type'] === 'xp_earned');
    expect(xpEntries).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 3. Non-accept grades award nothing
// ---------------------------------------------------------------------------

describe('Grading to a non-accepted status awards no XP', () => {
  it('revision awards no XP', async () => {
    const { studentId, discordId, homeworkId } = await seedBasics({ xpReward: 100 });
    const created = await createSubmission({ discordId, homeworkId, content: 'answer' });
    const id = (created.body['data'] as Record<string, unknown>)['id'] as string;

    const { status, body } = await gradeSubmission(id, {
      status: 'revision',
      feedback: 'needs work',
    });

    expect(status).toBe(200);
    expect((body['data'] as Record<string, unknown>)['xp']).toBeNull();

    const student = await getStudent(studentId);
    expect(student['xp']).toBe(0);
  });

  it('grading (in-review) awards no XP', async () => {
    const { studentId, discordId, homeworkId } = await seedBasics({ xpReward: 100 });
    const created = await createSubmission({ discordId, homeworkId, content: 'answer' });
    const id = (created.body['data'] as Record<string, unknown>)['id'] as string;

    const { status, body } = await gradeSubmission(id, { status: 'grading' });

    expect(status).toBe(200);
    expect((body['data'] as Record<string, unknown>)['xp']).toBeNull();

    const student = await getStudent(studentId);
    expect(student['xp']).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Level-up
// ---------------------------------------------------------------------------

describe('Level-up on crossing an XP threshold', () => {
  it('crosses level 2 (300xp) on the grade that pushes cumulative xp over the line', async () => {
    const courseId = await createCourse();
    const discordId = 'disc-xp-levelup';
    const studentId = await registerStudent(discordId);

    // xpReward 300 + early bonus 30 = 330 >= 300 threshold in a single award.
    const homework = await createHomeworkInCourse(courseId, {
      xpReward: 300,
      deadline: futureDate(30),
    });
    const homeworkId = homework['id'] as string;

    const created = await createSubmission({ discordId, homeworkId, content: 'answer' });
    const id = (created.body['data'] as Record<string, unknown>)['id'] as string;

    const { status, body } = await gradeSubmission(id, { status: 'accepted', score: 100 });

    expect(status).toBe(200);
    const xp = (body['data'] as Record<string, unknown>)['xp'] as Record<string, unknown>;
    expect(xp['xpAwarded']).toBe(330);
    expect(xp['leveledUp']).toBe(true);
    expect(xp['newLevel']).toBe(2);
    expect(xp['newTitle']).toBe('Coder');

    const student = await getStudent(studentId);
    expect(student['level']).toBe(2);
    expect(student['xp']).toBe(330);

    const activity = await getActivity(studentId);
    const entries = activity['data'] as Array<Record<string, unknown>>;
    const levelUpEntry = entries.find((e) => e['type'] === 'level_up');
    expect(levelUpEntry).toBeDefined();
    expect(levelUpEntry?.['amount']).toBe(2);
  });

  it('does not level up when xp remains below the next threshold', async () => {
    const { studentId, discordId, homeworkId } = await seedBasics({
      xpReward: 50,
      deadline: futureDate(30),
    });
    const created = await createSubmission({ discordId, homeworkId, content: 'answer' });
    const id = (created.body['data'] as Record<string, unknown>)['id'] as string;

    const { body } = await gradeSubmission(id, { status: 'accepted', score: 100 });
    const xp = (body['data'] as Record<string, unknown>)['xp'] as Record<string, unknown>;
    expect(xp['leveledUp']).toBe(false);
    expect(xp['newLevel']).toBe(1);

    const student = await getStudent(studentId);
    expect(student['level']).toBe(1);

    const activity = await getActivity(studentId);
    const entries = activity['data'] as Array<Record<string, unknown>>;
    expect(entries.find((e) => e['type'] === 'level_up')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 5. Attendance XP
// ---------------------------------------------------------------------------

describe('Attendance check-in — XP award', () => {
  it('awards attend_class XP (20) on checkin', async () => {
    const courseId = await createCourse();
    const discordId = 'disc-xp-att';
    const studentId = await registerStudent(discordId);
    await createLesson(courseId, 0);

    const { status, body } = await checkin(discordId);

    expect(status).toBe(201);
    const data = body['data'] as Record<string, unknown>;
    const xp = data['xp'] as Record<string, unknown>;
    expect(xp).not.toBeNull();
    expect(xp['xpAwarded']).toBe(20);

    const student = await getStudent(studentId);
    expect(student['xp']).toBe(20);

    const activity = await getActivity(studentId);
    const entries = activity['data'] as Array<Record<string, unknown>>;
    const xpEntry = entries.find((e) => e['type'] === 'xp_earned');
    expect(xpEntry).toBeDefined();
    expect(xpEntry?.['amount']).toBe(20);
  });

  it('markAttendance (teacher correction) awards no XP', async () => {
    const courseId = await createCourse();
    const discordId = 'disc-xp-mark';
    const studentId = await registerStudent(discordId);
    const lesson = await createLesson(courseId, 0);
    const lessonId = lesson['id'] as string;

    const res = await request(app)
      .post(`/api/attendance/lesson/${lessonId}/mark`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ discordId, status: 'absent' });

    expect(res.status).toBe(200);

    const student = await getStudent(studentId);
    expect(student['xp']).toBe(0);

    const activity = await getActivity(studentId);
    const entries = activity['data'] as Array<Record<string, unknown>>;
    expect(entries.find((e) => e['type'] === 'xp_earned')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 6. Activity endpoint — pagination + ordering
// ---------------------------------------------------------------------------

describe('GET /api/students/:id/activity', () => {
  it('returns a paginated envelope sorted newest-first, including xp_earned and level_up entries', async () => {
    const courseId = await createCourse();
    const discordId = 'disc-xp-activity';
    const studentId = await registerStudent(discordId);

    // First award: attendance (20 xp) — recorded first (oldest).
    await createLesson(courseId, 0);
    await checkin(discordId);

    // Second award: homework crossing level 2 (300 xp + 30 early = 330; total 350).
    const homework = await createHomeworkInCourse(courseId, {
      xpReward: 300,
      deadline: futureDate(30),
    });
    const submitted = await createSubmission({
      discordId,
      homeworkId: homework['id'],
      content: 'answer',
    });
    const submissionId = (submitted.body['data'] as Record<string, unknown>)['id'] as string;
    await gradeSubmission(submissionId, { status: 'accepted', score: 100 });

    const res = await request(app)
      .get(`/api/students/${studentId}/activity`)
      .set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data as Record<string, unknown>;
    expect(Array.isArray(data['data'])).toBe(true);
    expect(typeof data['total']).toBe('number');
    expect(typeof data['page']).toBe('number');
    expect(typeof data['limit']).toBe('number');
    expect(typeof data['totalPages']).toBe('number');

    const entries = data['data'] as Array<Record<string, unknown>>;
    // attendance xp_earned + homework xp_earned + level_up = 3 entries
    expect(data['total']).toBe(3);
    expect(entries).toHaveLength(3);

    // Sorted newest-first: the level_up/xp_earned from the homework grade
    // (which happened after checkin) should come before the attendance entry.
    const createdAts = entries.map((e) => new Date(e['createdAt'] as string).getTime());
    for (let i = 0; i + 1 < createdAts.length; i++) {
      expect(createdAts[i]).toBeGreaterThanOrEqual(createdAts[i + 1] as number);
    }

    const types = entries.map((e) => e['type']);
    expect(types).toContain('xp_earned');
    expect(types).toContain('level_up');

    // Pagination: limit=1 returns exactly one entry, totalPages reflects total.
    const paged = await getActivity(studentId, '?page=1&limit=1');
    expect((paged['data'] as unknown[]).length).toBe(1);
    expect(paged['totalPages']).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 7. awardXp (unit) — direct threshold-crossing coverage
// ---------------------------------------------------------------------------

describe('awardXp (unit)', () => {
  it('increments xp, persists a level increase, and records level_up + xp_earned activity', async () => {
    const discordId = 'disc-xp-unit';
    const studentId = await registerStudent(discordId);

    // Pre-load the student close to the level-2 threshold (300xp).
    await StudentModel.findByIdAndUpdate(studentId, { $set: { xp: 290 } });

    const result = await awardXp({
      studentId,
      amount: 20,
      description: 'unit test award',
    });

    expect(result.xpAwarded).toBe(20);
    expect(result.newXp).toBe(310);
    expect(result.leveledUp).toBe(true);
    expect(result.newLevel).toBe(2);
    expect(result.newTitle).toBe('Coder');
    expect(result.discordId).toBe(discordId);

    // Confirm getLevelFromXp agrees (sanity on the shared helper used by the service).
    expect(getLevelFromXp(310)).toEqual({ level: 2, title: 'Coder' });

    const studentDoc = await StudentModel.findById(studentId);
    expect(studentDoc?.level).toBe(2);

    const logs = await ActivityLogModel.find({ studentId }).sort({ createdAt: 1 });
    expect(logs.map((l) => l.type)).toEqual(['level_up', 'xp_earned']);
  });

  it('does not persist a level change or record level_up when staying below threshold', async () => {
    const discordId = 'disc-xp-unit-nolvl';
    const studentId = await registerStudent(discordId);

    const result = await awardXp({
      studentId,
      amount: 10,
      description: 'small award',
    });

    expect(result.leveledUp).toBe(false);
    expect(result.newLevel).toBe(1);

    const studentDoc = await StudentModel.findById(studentId);
    expect(studentDoc?.level).toBe(1);

    const logs = await ActivityLogModel.find({ studentId });
    expect(logs.map((l) => l.type)).toEqual(['xp_earned']);
  });
});
