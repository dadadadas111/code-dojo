/**
 * Integration tests for the Leaderboard Engine (Phase 7).
 *
 * Setup notes:
 * - Env vars are injected in src/tests/setup.ts (loaded before any app module).
 * - Each test suite connects to MongoDB (code-dojo-test database).
 * - afterEach clears the students collection so tests are fully isolated.
 *
 * Redis hygiene:
 * - awardXp/awardCoins call safeZAdd, which writes members into the REAL sorted
 *   sets `leaderboard:xp` / `leaderboard:coins` on localhost:6379 (no test-mode
 *   Redis exists). Left alone, these accumulate stale members across runs and
 *   make ranking assertions non-deterministic.
 * - beforeEach deletes all three leaderboard keys so every test starts from a
 *   clean, known ranking, seeded with exactly the students it asserts on.
 * - afterAll deletes the keys again to leave the shared dev keyspace clean, and
 *   quits the app's shared `redis` singleton so the suite exits without an open
 *   handle (this is the only Redis-touching test file, and files run
 *   sequentially in a single process per vitest.config.ts).
 * - Never FLUSHDB/FLUSHALL — only the three leaderboard:* keys are touched.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import mongoose from 'mongoose';

import { createServer } from '../app';
import { redis } from '../db/connection';
import { StudentModel } from '../db/models/student.model';
import { CourseModel } from '../db/models/course.model';
import { HomeworkModel } from '../db/models/homework.model';
import { SubmissionModel } from '../db/models/submission.model';
import { ActivityLogModel } from '../db/models/activitylog.model';

const VALID_KEY = 'test-api-key-0123456789';
const AUTH = `Bearer ${VALID_KEY}`;
const TEACHER = { 'X-Teacher': 'true' };
const MONGO_URI = 'mongodb://localhost:27017/code-dojo-test';

const LEADERBOARD_KEYS = ['leaderboard:xp', 'leaderboard:coins', 'leaderboard:streak'];

let app: Application;

beforeAll(async () => {
  await mongoose.connect(MONGO_URI);
  app = await createServer();
});

beforeEach(async () => {
  await redis.del(...LEADERBOARD_KEYS);
});

afterEach(async () => {
  await StudentModel.deleteMany({});
  await CourseModel.deleteMany({});
  await HomeworkModel.deleteMany({});
  await SubmissionModel.deleteMany({});
  await ActivityLogModel.deleteMany({});
  await redis.del(...LEADERBOARD_KEYS);
});

afterAll(async () => {
  await redis.del(...LEADERBOARD_KEYS);
  await mongoose.disconnect();
  await redis.quit();
});

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

function futureDate(daysFromNow = 30): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString();
}

async function registerStudent(discordId: string, displayName = 'Test Student'): Promise<string> {
  const res = await request(app)
    .post('/api/students')
    .set('Authorization', AUTH)
    .send({ discordId, displayName });
  return (res.body.data as Record<string, unknown>)['id'] as string;
}

async function setStudentStats(studentId: string, patch: Record<string, unknown>): Promise<void> {
  await StudentModel.findByIdAndUpdate(studentId, { $set: patch });
}

async function rebuild(): Promise<void> {
  const res = await request(app)
    .post('/api/gamification/leaderboard/rebuild')
    .set('Authorization', AUTH)
    .set(TEACHER);
  expect(res.status).toBe(200);
}

async function getLeaderboard(
  metric: string,
  query = '',
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await request(app)
    .get(`/api/gamification/leaderboard/${metric}${query}`)
    .set('Authorization', AUTH);
  return { status: res.status, body: res.body as Record<string, unknown> };
}

async function getRank(
  metric: string,
  discordId: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await request(app)
    .get(`/api/gamification/leaderboard/${metric}/rank?discordId=${discordId}`)
    .set('Authorization', AUTH);
  return { status: res.status, body: res.body as Record<string, unknown> };
}

async function createCourse(): Promise<string> {
  const res = await request(app).post('/api/courses').set('Authorization', AUTH).set(TEACHER).send({
    name: 'TypeScript Fundamentals',
    description: 'Learn TypeScript from scratch',
    startDate: '2025-01-01',
    isActive: true,
  });
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

async function createSubmission(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await request(app).post('/api/submissions').set('Authorization', AUTH).send(body);
  return res.body.data as Record<string, unknown>;
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

// ---------------------------------------------------------------------------
// 1. Ranking desc
// ---------------------------------------------------------------------------

describe('GET /api/gamification/leaderboard/xp — ranking', () => {
  it('ranks students by xp descending with correct rank, displayName and score', async () => {
    const id1 = await registerStudent('disc-lb-1', 'Alice');
    const id2 = await registerStudent('disc-lb-2', 'Bob');
    const id3 = await registerStudent('disc-lb-3', 'Carol');

    await setStudentStats(id1, { xp: 100 });
    await setStudentStats(id2, { xp: 300 });
    await setStudentStats(id3, { xp: 200 });
    await rebuild();

    const { status, body } = await getLeaderboard('xp');

    expect(status).toBe(200);
    expect(body['success']).toBe(true);
    const data = body['data'] as Record<string, unknown>;
    expect(data['total']).toBe(3);
    const entries = data['data'] as Array<Record<string, unknown>>;
    expect(entries).toHaveLength(3);

    expect(entries[0]).toMatchObject({ rank: 1, studentId: id2, displayName: 'Bob', score: 300 });
    expect(entries[1]).toMatchObject({
      rank: 2,
      studentId: id3,
      displayName: 'Carol',
      score: 200,
    });
    expect(entries[2]).toMatchObject({
      rank: 3,
      studentId: id1,
      displayName: 'Alice',
      score: 100,
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Pagination
// ---------------------------------------------------------------------------

describe('GET /api/gamification/leaderboard/xp — pagination', () => {
  it('returns the correct single entry with global rank preserved on page 2', async () => {
    const id1 = await registerStudent('disc-lb-p1', 'Alice');
    const id2 = await registerStudent('disc-lb-p2', 'Bob');
    const id3 = await registerStudent('disc-lb-p3', 'Carol');

    await setStudentStats(id1, { xp: 100 });
    await setStudentStats(id2, { xp: 300 });
    await setStudentStats(id3, { xp: 200 });
    await rebuild();

    const { status, body } = await getLeaderboard('xp', '?page=2&limit=1');

    expect(status).toBe(200);
    const data = body['data'] as Record<string, unknown>;
    expect(data['total']).toBe(3);
    expect(data['page']).toBe(2);
    expect(data['limit']).toBe(1);
    expect(data['totalPages']).toBe(3);

    const entries = data['data'] as Array<Record<string, unknown>>;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ rank: 2, studentId: id3, displayName: 'Carol', score: 200 });
  });
});

// ---------------------------------------------------------------------------
// 3. Coins metric
// ---------------------------------------------------------------------------

describe('GET /api/gamification/leaderboard/coins', () => {
  it('ranks students by coins descending', async () => {
    const id1 = await registerStudent('disc-lb-c1', 'Alice');
    const id2 = await registerStudent('disc-lb-c2', 'Bob');

    await setStudentStats(id1, { coins: 50 });
    await setStudentStats(id2, { coins: 500 });
    await rebuild();

    const { status, body } = await getLeaderboard('coins');

    expect(status).toBe(200);
    const data = body['data'] as Record<string, unknown>;
    const entries = data['data'] as Array<Record<string, unknown>>;
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ rank: 1, studentId: id2, displayName: 'Bob', score: 500 });
    expect(entries[1]).toMatchObject({ rank: 2, studentId: id1, displayName: 'Alice', score: 50 });
  });
});

// ---------------------------------------------------------------------------
// 4. Rank lookup
// ---------------------------------------------------------------------------

describe('GET /api/gamification/leaderboard/:metric/rank', () => {
  it('returns the correct rank and score for the middle-ranked student', async () => {
    const id1 = await registerStudent('disc-lb-r1', 'Alice');
    const id2 = await registerStudent('disc-lb-r2', 'Bob');
    const id3 = await registerStudent('disc-lb-r3', 'Carol');

    await setStudentStats(id1, { xp: 100 });
    await setStudentStats(id2, { xp: 200 });
    await setStudentStats(id3, { xp: 300 });
    await rebuild();

    const { status, body } = await getRank('xp', 'disc-lb-r2');

    expect(status).toBe(200);
    const data = body['data'] as Record<string, unknown>;
    expect(data).toMatchObject({ rank: 2, score: 200, studentId: id2, displayName: 'Bob' });
  });

  it('returns 404 for an unregistered discordId', async () => {
    const { status, body } = await getRank('xp', 'disc-does-not-exist');
    expect(status).toBe(404);
    expect(body['success']).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Invalid metric
// ---------------------------------------------------------------------------

describe('GET /api/gamification/leaderboard/:metric — validation', () => {
  it('returns 422 for an unsupported metric', async () => {
    const { status, body } = await getLeaderboard('bogus');
    expect(status).toBe(422);
    expect(body['success']).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. Cold-start rebuild
// ---------------------------------------------------------------------------

describe('GET /api/gamification/leaderboard/xp — cold-start rebuild', () => {
  it('auto-rebuilds from Mongo when the sorted set is empty', async () => {
    const id1 = await registerStudent('disc-lb-cold1', 'Alice');
    const id2 = await registerStudent('disc-lb-cold2', 'Bob');
    await setStudentStats(id1, { xp: 40 });
    await setStudentStats(id2, { xp: 80 });

    // Ensure the sorted set is empty (no rebuild has run yet in this test).
    await redis.del('leaderboard:xp');
    expect(await redis.zcard('leaderboard:xp')).toBe(0);

    const { status, body } = await getLeaderboard('xp');

    expect(status).toBe(200);
    const data = body['data'] as Record<string, unknown>;
    expect(data['total']).toBe(2);
    const entries = data['data'] as Array<Record<string, unknown>>;
    expect(entries[0]).toMatchObject({ rank: 1, studentId: id2, displayName: 'Bob', score: 80 });
    expect(entries[1]).toMatchObject({ rank: 2, studentId: id1, displayName: 'Alice', score: 40 });
  });
});

// ---------------------------------------------------------------------------
// 7. Teacher rebuild endpoint
// ---------------------------------------------------------------------------

describe('POST /api/gamification/leaderboard/rebuild', () => {
  it('rejects non-teacher callers with 403', async () => {
    const res = await request(app)
      .post('/api/gamification/leaderboard/rebuild')
      .set('Authorization', AUTH);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('rebuilds all sorted sets to reflect the current student count when called by a teacher', async () => {
    const id1 = await registerStudent('disc-lb-rb1', 'Alice');
    const id2 = await registerStudent('disc-lb-rb2', 'Bob');
    await setStudentStats(id1, { xp: 10 });
    await setStudentStats(id2, { xp: 20 });

    const res = await request(app)
      .post('/api/gamification/leaderboard/rebuild')
      .set('Authorization', AUTH)
      .set(TEACHER);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const card = await redis.zcard('leaderboard:xp');
    expect(card).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 8. safeZAdd via award (inline sync on grading)
// ---------------------------------------------------------------------------

describe('safeZAdd via awardXp — inline leaderboard sync', () => {
  it('updates leaderboard:xp ZSCORE immediately when a homework submission is accepted', async () => {
    const courseId = await createCourse();
    const discordId = 'disc-lb-award';
    const studentId = await registerStudent(discordId);
    const homework = await createHomeworkInCourse(courseId, {
      xpReward: 75,
      deadline: futureDate(30),
    });
    const submitted = await createSubmission({
      discordId,
      homeworkId: homework['id'],
      content: 'answer',
    });
    const submissionId = submitted['id'] as string;

    const { status } = await gradeSubmission(submissionId, { status: 'accepted', score: 90 });
    expect(status).toBe(200);

    const student = await StudentModel.findById(studentId);
    expect(student?.xp).toBeGreaterThan(0);

    const score = await redis.zscore('leaderboard:xp', studentId);
    expect(score).not.toBeNull();
    expect(Number(score)).toBe(student?.xp);
  });
});
