/**
 * Integration tests for the Coin System (Phase 6).
 *
 * Setup notes:
 * - Env vars are injected in src/tests/setup.ts (loaded before any app module).
 * - Each test suite connects to MongoDB (code-dojo-test database).
 * - afterEach clears students, courses, homeworks, submissions, lessons,
 *   attendances, and activitylogs collections so tests are fully isolated.
 * - Reward values are chosen explicitly so assertions are predictable and to
 *   isolate coin behaviour from XP behaviour (asymmetric xpReward/coinReward).
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import mongoose from 'mongoose';

import { createServer } from '../app';
import { CourseModel } from '../db/models/course.model';
import { HomeworkModel } from '../db/models/homework.model';
import { StudentModel } from '../db/models/student.model';
import { SubmissionModel } from '../db/models/submission.model';
import { LessonModel } from '../db/models/lesson.model';
import { AttendanceModel } from '../db/models/attendance.model';
import { ActivityLogModel } from '../db/models/activitylog.model';
import { awardCoins } from '../services/coin.service';

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
      coinReward: 0,
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
  const discordId = 'disc-coin-001';
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
// 1. Homework coins on accept
// ---------------------------------------------------------------------------

describe('Grading a homework submission — coin award', () => {
  it('awards coinReward when accepted on time', async () => {
    const { studentId, discordId, homeworkId } = await seedBasics({
      xpReward: 100,
      coinReward: 50,
      deadline: futureDate(30),
    });
    const created = await createSubmission({ discordId, homeworkId, content: 'answer' });
    const id = (created.body['data'] as Record<string, unknown>)['id'] as string;

    const { status, body } = await gradeSubmission(id, { status: 'accepted', score: 90 });

    expect(status).toBe(200);
    const data = body['data'] as Record<string, unknown>;
    const coins = data['coins'] as Record<string, unknown>;
    expect(coins).not.toBeNull();
    expect(coins['coinsAwarded']).toBe(50);
    expect(coins['newBalance']).toBe(50);

    const student = await getStudent(studentId);
    expect(student['coins']).toBe(50);

    const activity = await getActivity(studentId);
    const entries = activity['data'] as Array<Record<string, unknown>>;
    const coinEntry = entries.find((e) => e['type'] === 'coin_earned');
    expect(coinEntry).toBeDefined();
    expect(coinEntry?.['amount']).toBe(50);
    expect((coinEntry?.['metadata'] as Record<string, unknown>)?.['submissionId']).toBe(id);
  });
});

// ---------------------------------------------------------------------------
// 2. Asymmetric rewards — independent award behaviour
// ---------------------------------------------------------------------------

describe('Independent XP/coin awards on grading', () => {
  it('awards coins but no XP when xpReward is 0 and the submission is late', async () => {
    const { studentId, discordId, homeworkId } = await seedBasics({
      xpReward: 0,
      coinReward: 50,
      deadline: pastDate(1),
    });
    const created = await createSubmission({ discordId, homeworkId, content: 'answer' });
    const createdData = created.body['data'] as Record<string, unknown>;
    expect(createdData['status']).toBe('late'); // sanity: submittedAt > deadline, no early bonus
    const id = createdData['id'] as string;

    const { status, body } = await gradeSubmission(id, { status: 'accepted', score: 80 });

    expect(status).toBe(200);
    const data = body['data'] as Record<string, unknown>;
    expect(data['xp']).toBeNull();
    const coins = data['coins'] as Record<string, unknown>;
    expect(coins['coinsAwarded']).toBe(50);

    const student = await getStudent(studentId);
    expect(student['xp']).toBe(0);
    expect(student['coins']).toBe(50);
  });

  it('awards XP but no coins when coinReward is 0', async () => {
    const { studentId, discordId, homeworkId } = await seedBasics({
      xpReward: 100,
      coinReward: 0,
      deadline: futureDate(30),
    });
    const created = await createSubmission({ discordId, homeworkId, content: 'answer' });
    const id = (created.body['data'] as Record<string, unknown>)['id'] as string;

    const { status, body } = await gradeSubmission(id, { status: 'accepted', score: 90 });

    expect(status).toBe(200);
    const data = body['data'] as Record<string, unknown>;
    expect(data['coins']).toBeNull();
    const xp = data['xp'] as Record<string, unknown>;
    expect(xp['xpAwarded']).toBe(130); // 100 + 30 early bonus

    const student = await getStudent(studentId);
    expect(student['xp']).toBe(130);
    expect(student['coins']).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Idempotency — shared guard covers both currencies
// ---------------------------------------------------------------------------

describe('Grading idempotency — coins are only awarded once per submission', () => {
  it('does not re-award XP or coins when accepted twice in a row', async () => {
    const { studentId, discordId, homeworkId } = await seedBasics({
      xpReward: 50,
      coinReward: 20,
      deadline: futureDate(30),
    });
    const created = await createSubmission({ discordId, homeworkId, content: 'answer' });
    const id = (created.body['data'] as Record<string, unknown>)['id'] as string;

    const first = await gradeSubmission(id, { status: 'accepted', score: 90 });
    const firstData = first.body['data'] as Record<string, unknown>;
    expect(firstData['xp']).not.toBeNull();
    expect(firstData['coins']).not.toBeNull();

    const studentAfterFirst = await getStudent(studentId);
    const xpAfterFirst = studentAfterFirst['xp'];
    const coinsAfterFirst = studentAfterFirst['coins'];

    const second = await gradeSubmission(id, { status: 'accepted', score: 95 });
    expect(second.status).toBe(200);
    const secondData = second.body['data'] as Record<string, unknown>;
    expect(secondData['xp']).toBeNull();
    expect(secondData['coins']).toBeNull();

    const studentAfterSecond = await getStudent(studentId);
    expect(studentAfterSecond['xp']).toBe(xpAfterFirst);
    expect(studentAfterSecond['coins']).toBe(coinsAfterFirst);

    const activity = await getActivity(studentId);
    const entries = activity['data'] as Array<Record<string, unknown>>;
    const coinEntries = entries.filter((e) => e['type'] === 'coin_earned');
    expect(coinEntries).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 4. Attendance coins
// ---------------------------------------------------------------------------

describe('Attendance check-in — coin award', () => {
  it('awards attend_class coins (10) on checkin', async () => {
    const courseId = await createCourse();
    const discordId = 'disc-coin-att';
    const studentId = await registerStudent(discordId);
    await createLesson(courseId, 0);

    const { status, body } = await checkin(discordId);

    expect(status).toBe(201);
    const data = body['data'] as Record<string, unknown>;
    const coins = data['coins'] as Record<string, unknown>;
    expect(coins).not.toBeNull();
    expect(coins['coinsAwarded']).toBe(10);

    const student = await getStudent(studentId);
    expect(student['coins']).toBe(10);

    const activity = await getActivity(studentId);
    const entries = activity['data'] as Array<Record<string, unknown>>;
    const coinEntry = entries.find((e) => e['type'] === 'coin_earned');
    expect(coinEntry).toBeDefined();
    expect(coinEntry?.['amount']).toBe(10);
  });

  it('markAttendance (teacher correction) awards no coins', async () => {
    const courseId = await createCourse();
    const discordId = 'disc-coin-mark';
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
    expect(student['coins']).toBe(0);

    const activity = await getActivity(studentId);
    const entries = activity['data'] as Array<Record<string, unknown>>;
    expect(entries.find((e) => e['type'] === 'coin_earned')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 5. Activity endpoint — type filter
// ---------------------------------------------------------------------------

describe('GET /api/students/:id/activity?type=', () => {
  it('filters to only coin_earned or only xp_earned entries, and 422s on an unknown type', async () => {
    const courseId = await createCourse();
    const discordId = 'disc-coin-filter';
    const studentId = await registerStudent(discordId);

    // Attendance: awards both xp_earned and coin_earned.
    await createLesson(courseId, 0);
    await checkin(discordId);

    // Homework: coinReward only, submitted late so the early XP bonus doesn't
    // kick in and xpAmount stays at exactly 0 (no xp_earned entry produced).
    const homework = await createHomeworkInCourse(courseId, {
      xpReward: 0,
      coinReward: 25,
      deadline: pastDate(1),
    });
    const submitted = await createSubmission({
      discordId,
      homeworkId: homework['id'],
      content: 'answer',
    });
    const submissionId = (submitted.body['data'] as Record<string, unknown>)['id'] as string;
    await gradeSubmission(submissionId, { status: 'accepted', score: 100 });

    const coinOnly = await getActivity(studentId, '?type=coin_earned');
    const coinEntries = coinOnly['data'] as Array<Record<string, unknown>>;
    expect(coinEntries.length).toBeGreaterThan(0);
    expect(coinEntries.every((e) => e['type'] === 'coin_earned')).toBe(true);
    expect(coinEntries).toHaveLength(2); // attendance + homework

    const xpOnly = await getActivity(studentId, '?type=xp_earned');
    const xpEntries = xpOnly['data'] as Array<Record<string, unknown>>;
    expect(xpEntries.length).toBeGreaterThan(0);
    expect(xpEntries.every((e) => e['type'] === 'xp_earned')).toBe(true);
    expect(xpEntries).toHaveLength(1); // attendance only (homework xpReward=0)

    const res = await request(app)
      .get(`/api/students/${studentId}/activity?type=bogus`)
      .set('Authorization', AUTH);
    expect(res.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// 6. awardCoins (unit)
// ---------------------------------------------------------------------------

describe('awardCoins (unit)', () => {
  it('increments the coin balance and records a coin_earned activity entry', async () => {
    const discordId = 'disc-coin-unit';
    const studentId = await registerStudent(discordId);

    const result = await awardCoins({
      studentId,
      amount: 15,
      description: 'unit test award',
      metadata: { source: 'unit-test' },
    });

    expect(result.coinsAwarded).toBe(15);
    expect(result.newBalance).toBe(15);
    expect(result.discordId).toBe(discordId);

    const studentDoc = await StudentModel.findById(studentId);
    expect(studentDoc?.coins).toBe(15);
    // Coins carry no level logic — level stays untouched by a coin award.
    expect(studentDoc?.level).toBe(1);

    const logs = await ActivityLogModel.find({ studentId });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.type).toBe('coin_earned');
    expect(logs[0]?.amount).toBe(15);
    expect((logs[0]?.metadata as Record<string, unknown>)?.['source']).toBe('unit-test');
  });

  it('accumulates balance across multiple awards for the same student', async () => {
    const discordId = 'disc-coin-unit-accum';
    const studentId = await registerStudent(discordId);

    await awardCoins({ studentId, amount: 10, description: 'first' });
    const second = await awardCoins({ studentId, amount: 5, description: 'second' });

    expect(second.newBalance).toBe(15);

    const studentDoc = await StudentModel.findById(studentId);
    expect(studentDoc?.coins).toBe(15);

    const logs = await ActivityLogModel.find({ studentId });
    expect(logs).toHaveLength(2);
  });
});
