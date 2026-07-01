/**
 * Integration tests for the Attendance API (Phase 4).
 *
 * Setup notes:
 * - Env vars are injected in src/tests/setup.ts (loaded before any app module).
 * - Each test suite connects to MongoDB (code-dojo-test database).
 * - afterEach clears attendances, lessons, courses, and students collections
 *   so tests are fully isolated.
 * - Checkin only succeeds when the active course has a lesson scheduled TODAY
 *   (ICT calendar day). Seed helpers below build a lesson at an offset from
 *   "now" so it always lands within today's ICT window in CI.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import mongoose from 'mongoose';

import { createServer } from '../app';
import { AttendanceModel } from '../db/models/attendance.model';
import { CourseModel } from '../db/models/course.model';
import { LessonModel } from '../db/models/lesson.model';
import { StudentModel } from '../db/models/student.model';

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
  await AttendanceModel.deleteMany({});
  await LessonModel.deleteMany({});
  await CourseModel.deleteMany({});
  await StudentModel.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
});

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function createCourse(overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await request(app)
    .post('/api/courses')
    .set('Authorization', AUTH)
    .set(TEACHER)
    .send({ ...VALID_COURSE_BODY, isActive: true, ...overrides });
  return (res.body.data as Record<string, unknown>)['id'] as string;
}

async function registerStudent(discordId: string, displayName = 'Test Student'): Promise<string> {
  const res = await request(app)
    .post('/api/students')
    .set('Authorization', AUTH)
    .send({ discordId, displayName });
  return (res.body.data as Record<string, unknown>)['id'] as string;
}

/** Creates a lesson via the API with scheduledDate = now + minutesFromNow. */
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

/** Seeds an active course, a registered student, and a lesson scheduled `minutesFromNow`. */
async function seedBasics(
  minutesFromNow = 0,
): Promise<{ courseId: string; discordId: string; lessonId: string }> {
  const courseId = await createCourse();
  const discordId = 'disc-att-001';
  await registerStudent(discordId);
  const lesson = await createLesson(courseId, minutesFromNow);
  return { courseId, discordId, lessonId: lesson['id'] as string };
}

// ---------------------------------------------------------------------------
// 1. Auth
// ---------------------------------------------------------------------------

describe('Auth middleware', () => {
  it('returns 401 when Authorization header is absent on checkin', async () => {
    const res = await request(app).post('/api/attendance/checkin').send({ discordId: 'x' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2 & 3. Checkin — status derivation, duplicates
// ---------------------------------------------------------------------------

describe('POST /api/attendance/checkin', () => {
  it('returns 201 with status present when checking in near the scheduled start', async () => {
    const { discordId } = await seedBasics(0);

    const { status, body } = await checkin(discordId);

    expect(status).toBe(201);
    expect(body['success']).toBe(true);
    const data = body['data'] as Record<string, unknown>;
    expect(data['status']).toBe('present');
    expect(data['checkinTime']).toBeDefined();
    expect(data['checkinTime']).not.toBeNull();
  });

  it('returns 201 with status late when checking in more than 10 minutes after start', async () => {
    const { discordId } = await seedBasics(-30);

    const { status, body } = await checkin(discordId);

    expect(status).toBe(201);
    const data = body['data'] as Record<string, unknown>;
    expect(data['status']).toBe('late');
  });

  it('returns 409 on a duplicate checkin for the same student + lesson', async () => {
    const { discordId } = await seedBasics(0);

    const first = await checkin(discordId);
    expect(first.status).toBe(201);

    const second = await checkin(discordId);
    expect(second.status).toBe(409);
    expect(second.body['success']).toBe(false);
  });

  it('returns 404 when the active course has no lesson scheduled today', async () => {
    const courseId = await createCourse();
    const discordId = 'disc-att-nolesson';
    await registerStudent(discordId);
    // Lesson far in the future — outside today's ICT window.
    await createLesson(courseId, 60 * 24 * 10);

    const { status, body } = await checkin(discordId);
    expect(status).toBe(404);
    expect(body['success']).toBe(false);
  });

  it('returns 404 for an unregistered discordId', async () => {
    const courseId = await createCourse();
    await createLesson(courseId, 0);

    const { status, body } = await checkin('no-such-discord');
    expect(status).toBe(404);
    expect(body['success']).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Teacher lesson view
// ---------------------------------------------------------------------------

describe('GET /api/attendance/lesson/:lessonId', () => {
  it('returns 403 without X-Teacher header', async () => {
    const { lessonId } = await seedBasics(0);

    const res = await request(app)
      .get(`/api/attendance/lesson/${lessonId}`)
      .set('Authorization', AUTH);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('returns attendances and stats reflecting checked-in students', async () => {
    const courseId = await createCourse();
    const lesson = await createLesson(courseId, 0);
    const lessonId = lesson['id'] as string;

    const presentDiscordId = 'disc-att-present';
    const lateDiscordId = 'disc-att-late';
    await registerStudent(presentDiscordId);
    await registerStudent(lateDiscordId);

    // Both check in "now" against the same lesson (scheduled ~now) -> both present.
    await checkin(presentDiscordId);
    await checkin(lateDiscordId);

    const res = await request(app)
      .get(`/api/attendance/lesson/${lessonId}`)
      .set('Authorization', AUTH)
      .set(TEACHER);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data as Record<string, unknown>;
    const attendances = data['attendances'] as Array<Record<string, unknown>>;
    const stats = data['stats'] as Record<string, number>;

    expect(attendances).toHaveLength(2);
    expect(stats['present']).toBe(2);
    expect(stats['late']).toBe(0);
    expect(stats['absent']).toBe(0);
    expect(stats['total']).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 6. Teacher mark / correction
// ---------------------------------------------------------------------------

describe('POST /api/attendance/lesson/:lessonId/mark', () => {
  it('returns 403 without X-Teacher header', async () => {
    const { discordId, lessonId } = await seedBasics(0);

    const res = await request(app)
      .post(`/api/attendance/lesson/${lessonId}/mark`)
      .set('Authorization', AUTH)
      .send({ discordId, status: 'absent' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 for an unregistered discordId', async () => {
    const { lessonId } = await seedBasics(0);

    const res = await request(app)
      .post(`/api/attendance/lesson/${lessonId}/mark`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ discordId: 'no-such-discord', status: 'absent' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('flips an existing present record to absent while preserving checkinTime', async () => {
    const { discordId, lessonId } = await seedBasics(0);

    const checkedIn = await checkin(discordId);
    expect(checkedIn.status).toBe(201);
    const originalCheckinTime = (checkedIn.body['data'] as Record<string, unknown>)[
      'checkinTime'
    ] as string;

    const res = await request(app)
      .post(`/api/attendance/lesson/${lessonId}/mark`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ discordId, status: 'absent' });

    expect(res.status).toBe(200);
    const data = res.body.data as Record<string, unknown>;
    expect(data['status']).toBe('absent');
    expect(data['checkinTime']).toBe(originalCheckinTime);
  });

  it('creates a new record (upsert insert) for a student with no prior attendance', async () => {
    const { discordId, lessonId } = await seedBasics(0);

    const res = await request(app)
      .post(`/api/attendance/lesson/${lessonId}/mark`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ discordId, status: 'absent' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data as Record<string, unknown>;
    expect(data['status']).toBe('absent');
    expect(data['lessonId']).toBe(lessonId);
  });
});

// ---------------------------------------------------------------------------
// 7. Student history
// ---------------------------------------------------------------------------

describe('GET /api/attendance/student/by-discord/:discordId', () => {
  it('returns an empty array for a student with no attendance records', async () => {
    const discordId = 'disc-att-empty';
    await registerStudent(discordId);

    const res = await request(app)
      .get(`/api/attendance/student/by-discord/${discordId}`)
      .set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
  });

  it('returns the records for a student that has checked in', async () => {
    const { discordId, lessonId } = await seedBasics(0);
    await checkin(discordId);

    const res = await request(app)
      .get(`/api/attendance/student/by-discord/${discordId}`)
      .set('Authorization', AUTH);

    expect(res.status).toBe(200);
    const data = res.body.data as Array<Record<string, unknown>>;
    expect(data).toHaveLength(1);
    expect(data[0]?.['lessonId']).toBe(lessonId);
    expect(data[0]?.['status']).toBe('present');
  });
});

// ---------------------------------------------------------------------------
// 8. Stats — mixed scenario
// ---------------------------------------------------------------------------

describe('Attendance stats — mixed scenario', () => {
  it('reflects 2 present + 1 marked-absent as {present:2, late:0, absent:1, total:3}', async () => {
    const courseId = await createCourse();
    const lesson = await createLesson(courseId, 0);
    const lessonId = lesson['id'] as string;

    const studentA = 'disc-att-stat-a';
    const studentB = 'disc-att-stat-b';
    const studentC = 'disc-att-stat-c';
    await registerStudent(studentA);
    await registerStudent(studentB);
    await registerStudent(studentC);

    await checkin(studentA);
    await checkin(studentB);

    await request(app)
      .post(`/api/attendance/lesson/${lessonId}/mark`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ discordId: studentC, status: 'absent' });

    const res = await request(app)
      .get(`/api/attendance/lesson/${lessonId}`)
      .set('Authorization', AUTH)
      .set(TEACHER);

    expect(res.status).toBe(200);
    const stats = (res.body.data as Record<string, unknown>)['stats'] as Record<string, number>;
    expect(stats).toEqual({ present: 2, late: 0, absent: 1, total: 3 });
  });
});
