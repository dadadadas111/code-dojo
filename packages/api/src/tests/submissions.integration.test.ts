/**
 * Integration tests for the Submission API (Phase 3).
 *
 * Setup notes:
 * - Env vars are injected in src/tests/setup.ts (loaded before any app module).
 * - Each test suite connects to MongoDB (code-dojo-test database).
 * - afterEach clears courses, homework, students, and submissions collections
 *   so tests are fully isolated.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import mongoose from 'mongoose';

import { createServer } from '../app';
import { CourseModel } from '../db/models/course.model';
import { HomeworkModel } from '../db/models/homework.model';
import { StudentModel } from '../db/models/student.model';
import { SubmissionModel } from '../db/models/submission.model';
import { assertTransition } from '../services/submission.service';

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
  // GitHub link validation (github.service) must never hit the network in tests;
  // pretend every repo exists.
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
  await mongoose.connect(MONGO_URI);
  app = await createServer();
});

afterEach(async () => {
  await CourseModel.deleteMany({});
  await HomeworkModel.deleteMany({});
  await StudentModel.deleteMany({});
  await SubmissionModel.deleteMany({});
});

afterAll(async () => {
  vi.restoreAllMocks();
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
    .send({ ...VALID_COURSE_BODY, ...overrides });
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

async function createSubmission(
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await request(app).post('/api/submissions').set('Authorization', AUTH).send(body);
  return { status: res.status, body: res.body as Record<string, unknown> };
}

/** Seeds a course + registered student + homework, returns ids for convenience. */
async function seedBasics(
  homeworkOverrides: Record<string, unknown> = {},
): Promise<{ courseId: string; discordId: string; homeworkId: string }> {
  const courseId = await createCourse();
  const discordId = 'disc-sub-001';
  await registerStudent(discordId);
  const homework = await createHomeworkInCourse(courseId, homeworkOverrides);
  return { courseId, discordId, homeworkId: homework['id'] as string };
}

// ---------------------------------------------------------------------------
// 7. Create submission
// ---------------------------------------------------------------------------

describe('POST /api/submissions — create', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app).post('/api/submissions').send({});
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 201 with status pending for a future-deadline homework', async () => {
    const { discordId, homeworkId } = await seedBasics({ deadline: futureDate(30) });

    const { status, body } = await createSubmission({
      discordId,
      homeworkId,
      githubLink: 'https://github.com/example/repo',
    });

    expect(status).toBe(201);
    expect(body['success']).toBe(true);
    const data = body['data'] as Record<string, unknown>;
    expect(data['status']).toBe('pending');
    expect(data['homeworkId']).toBe(homeworkId);
  });

  it('returns 201 with status late for a past-deadline homework', async () => {
    const { discordId, homeworkId } = await seedBasics({ deadline: pastDate(1) });

    const { status, body } = await createSubmission({
      discordId,
      homeworkId,
      githubLink: 'https://github.com/example/repo',
    });

    expect(status).toBe(201);
    const data = body['data'] as Record<string, unknown>;
    expect(data['status']).toBe('late');
  });

  it('returns 409 for a duplicate submission (same student + homework)', async () => {
    const { discordId, homeworkId } = await seedBasics();

    await createSubmission({
      discordId,
      homeworkId,
      githubLink: 'https://github.com/example/repo',
    });

    const { status, body } = await createSubmission({
      discordId,
      homeworkId,
      githubLink: 'https://github.com/example/repo-2',
    });

    expect(status).toBe(409);
    expect(body['success']).toBe(false);
  });

  it('returns 404 for an unregistered discordId', async () => {
    const { homeworkId } = await seedBasics();

    const { status, body } = await createSubmission({
      discordId: 'no-such-discord',
      homeworkId,
      githubLink: 'https://github.com/example/repo',
    });

    expect(status).toBe(404);
    expect(body['success']).toBe(false);
  });

  it('returns 404 for a non-existent homeworkId', async () => {
    const discordId = 'disc-sub-nohw';
    await registerStudent(discordId);
    const fakeHomeworkId = new mongoose.Types.ObjectId().toHexString();

    const { status, body } = await createSubmission({
      discordId,
      homeworkId: fakeHomeworkId,
      githubLink: 'https://github.com/example/repo',
    });

    expect(status).toBe(404);
    expect(body['success']).toBe(false);
  });

  it('returns 422 when none of content/githubLink/fileUrl are provided', async () => {
    const { discordId, homeworkId } = await seedBasics();

    const { status, body } = await createSubmission({ discordId, homeworkId });

    expect(status).toBe(422);
    expect(body['success']).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. List — filters + pagination
// ---------------------------------------------------------------------------

describe('GET /api/submissions — list & filters', () => {
  it('filters by homeworkId, status, and discordId; returns paginated envelope', async () => {
    const courseId = await createCourse();
    const homeworkA = await createHomeworkInCourse(courseId, { title: 'HW A' });
    const homeworkB = await createHomeworkInCourse(courseId, { title: 'HW B' });

    const discordA = 'disc-filter-a';
    const discordB = 'disc-filter-b';
    await registerStudent(discordA);
    await registerStudent(discordB);

    await createSubmission({
      discordId: discordA,
      homeworkId: homeworkA['id'],
      content: 'answer A',
    });
    await createSubmission({
      discordId: discordB,
      homeworkId: homeworkA['id'],
      content: 'answer B',
    });
    await createSubmission({
      discordId: discordA,
      homeworkId: homeworkB['id'],
      content: 'answer A2',
    });

    // Base envelope shape
    const all = await request(app).get('/api/submissions').set('Authorization', AUTH);
    expect(all.status).toBe(200);
    const allData = all.body.data as Record<string, unknown>;
    expect(Array.isArray(allData['data'])).toBe(true);
    expect(typeof allData['total']).toBe('number');
    expect(typeof allData['page']).toBe('number');
    expect(typeof allData['limit']).toBe('number');
    expect(typeof allData['totalPages']).toBe('number');
    expect(allData['total']).toBe(3);

    // Filter by homeworkId
    const byHomework = await request(app)
      .get(`/api/submissions?homeworkId=${homeworkA['id'] as string}`)
      .set('Authorization', AUTH);
    expect((byHomework.body.data as Record<string, unknown>)['total']).toBe(2);

    // Filter by discordId
    const byDiscord = await request(app)
      .get(`/api/submissions?discordId=${discordA}`)
      .set('Authorization', AUTH);
    expect((byDiscord.body.data as Record<string, unknown>)['total']).toBe(2);

    // Filter by status
    const byStatus = await request(app)
      .get('/api/submissions?status=pending')
      .set('Authorization', AUTH);
    expect((byStatus.body.data as Record<string, unknown>)['total']).toBe(3);

    const byStatusNone = await request(app)
      .get('/api/submissions?status=accepted')
      .set('Authorization', AUTH);
    expect((byStatusNone.body.data as Record<string, unknown>)['total']).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 9. GET /:id
// ---------------------------------------------------------------------------

describe('GET /api/submissions/:id', () => {
  it('returns 200 for an existing submission', async () => {
    const { discordId, homeworkId } = await seedBasics();
    const created = await createSubmission({ discordId, homeworkId, content: 'my answer' });
    const id = (created.body['data'] as Record<string, unknown>)['id'] as string;

    const res = await request(app).get(`/api/submissions/${id}`).set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect((res.body.data as Record<string, unknown>)['id']).toBe(id);
  });

  it('returns 404 for a non-existent submission id', async () => {
    const fakeId = new mongoose.Types.ObjectId().toHexString();
    const res = await request(app).get(`/api/submissions/${fakeId}`).set('Authorization', AUTH);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 10. Grade [teacher]
// ---------------------------------------------------------------------------

describe('PATCH /api/submissions/:id — grade', () => {
  it('returns 403 without X-Teacher header', async () => {
    const { discordId, homeworkId } = await seedBasics();
    const created = await createSubmission({ discordId, homeworkId, content: 'answer' });
    const id = (created.body['data'] as Record<string, unknown>)['id'] as string;

    const res = await request(app)
      .patch(`/api/submissions/${id}`)
      .set('Authorization', AUTH)
      .send({ status: 'accepted', score: 90 });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('pending -> revision sets feedback', async () => {
    const { discordId, homeworkId } = await seedBasics();
    const created = await createSubmission({ discordId, homeworkId, content: 'answer' });
    const id = (created.body['data'] as Record<string, unknown>)['id'] as string;

    const res = await request(app)
      .patch(`/api/submissions/${id}`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ status: 'revision', feedback: 'Please fix the bug in part 2' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data as Record<string, unknown>;
    expect(data['status']).toBe('revision');
    expect(data['feedback']).toBe('Please fix the bug in part 2');
  });

  it('pending -> accepted with score sets gradedAt', async () => {
    const { discordId, homeworkId } = await seedBasics({ maxScore: 100 });
    const created = await createSubmission({ discordId, homeworkId, content: 'answer' });
    const id = (created.body['data'] as Record<string, unknown>)['id'] as string;

    const res = await request(app)
      .patch(`/api/submissions/${id}`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ status: 'accepted', score: 95 });

    expect(res.status).toBe(200);
    const data = res.body.data as Record<string, unknown>;
    expect(data['status']).toBe('accepted');
    expect(data['score']).toBe(95);
    expect(data['gradedAt']).toBeDefined();
    expect(data['gradedAt']).not.toBeNull();
  });

  it('returns 422 when score exceeds homework maxScore', async () => {
    const { discordId, homeworkId } = await seedBasics({ maxScore: 50 });
    const created = await createSubmission({ discordId, homeworkId, content: 'answer' });
    const id = (created.body['data'] as Record<string, unknown>)['id'] as string;

    const res = await request(app)
      .patch(`/api/submissions/${id}`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ status: 'accepted', score: 51 });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('returns 422 when score is negative', async () => {
    const { discordId, homeworkId } = await seedBasics();
    const created = await createSubmission({ discordId, homeworkId, content: 'answer' });
    const id = (created.body['data'] as Record<string, unknown>)['id'] as string;

    const res = await request(app)
      .patch(`/api/submissions/${id}`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ status: 'accepted', score: -1 });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 11. Resubmit
// ---------------------------------------------------------------------------

describe('PATCH /api/submissions/:id/resubmit', () => {
  async function createAndSendToRevision(): Promise<{
    id: string;
    discordId: string;
    homeworkId: string;
  }> {
    const { discordId, homeworkId } = await seedBasics({ deadline: futureDate(30) });
    const created = await createSubmission({ discordId, homeworkId, content: 'first attempt' });
    const id = (created.body['data'] as Record<string, unknown>)['id'] as string;

    await request(app)
      .patch(`/api/submissions/${id}`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ status: 'revision', feedback: 'needs work' });

    return { id, discordId, homeworkId };
  }

  it('owner resubmit after revision clears score/feedback/gradedAt and bumps submittedAt', async () => {
    const { id, discordId } = await createAndSendToRevision();

    const before = await request(app).get(`/api/submissions/${id}`).set('Authorization', AUTH);
    const submittedAtBefore = (before.body.data as Record<string, unknown>)[
      'submittedAt'
    ] as string;

    // Ensure a measurable time delta
    await new Promise((resolve) => setTimeout(resolve, 10));

    const res = await request(app)
      .patch(`/api/submissions/${id}/resubmit`)
      .set('Authorization', AUTH)
      .send({ discordId, content: 'fixed attempt' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data as Record<string, unknown>;
    expect(['pending', 'late']).toContain(data['status']);
    expect(data['score']).toBeNull();
    expect(data['feedback']).toBeNull();
    expect(data['gradedAt']).toBeNull();
    expect(new Date(data['submittedAt'] as string).getTime()).toBeGreaterThan(
      new Date(submittedAtBefore).getTime(),
    );
  });

  it('returns 409 when resubmitting a submission not in revision status', async () => {
    const { discordId, homeworkId } = await seedBasics();
    const created = await createSubmission({ discordId, homeworkId, content: 'answer' });
    const id = (created.body['data'] as Record<string, unknown>)['id'] as string;

    // Still 'pending' — never graded to revision
    const res = await request(app)
      .patch(`/api/submissions/${id}/resubmit`)
      .set('Authorization', AUTH)
      .send({ discordId, content: 'resubmit attempt' });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('returns 403 when a different student attempts to resubmit', async () => {
    const { id } = await createAndSendToRevision();
    const otherDiscordId = 'disc-sub-other';
    await registerStudent(otherDiscordId, 'Other Student');

    const res = await request(app)
      .patch(`/api/submissions/${id}/resubmit`)
      .set('Authorization', AUTH)
      .send({ discordId: otherDiscordId, content: 'attempted takeover' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 12. assertTransition — unit-level coverage of unreachable-via-HTTP 409
// ---------------------------------------------------------------------------

describe('assertTransition (unit)', () => {
  it('throws when transitioning to an invalid target status', () => {
    // 'pending' is not a valid target in ALLOWED_TRANSITIONS (only grading/accepted/revision are)
    expect(() => assertTransition('pending', 'pending')).toThrow();
  });

  it('does not throw for an allowed transition', () => {
    expect(() => assertTransition('pending', 'grading')).not.toThrow();
  });
});
