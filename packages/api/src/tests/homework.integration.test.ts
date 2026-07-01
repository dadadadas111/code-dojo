/**
 * Integration tests for the Homework API (Phase 3).
 *
 * Setup notes:
 * - Env vars are injected in src/tests/setup.ts (loaded before any app module).
 * - Each test suite connects to MongoDB (code-dojo-test database).
 * - afterEach clears both courses and homework collections so tests are fully isolated.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import mongoose from 'mongoose';

import { createServer } from '../app';
import { CourseModel } from '../db/models/course.model';
import { HomeworkModel } from '../db/models/homework.model';

const VALID_KEY = 'test-api-key-0123456789';
const AUTH = `Bearer ${VALID_KEY}`;
const TEACHER = { 'X-Teacher': 'true' };
const MONGO_URI = 'mongodb://localhost:27017/code-dojo-test';

const VALID_COURSE_BODY = {
  name: 'TypeScript Fundamentals',
  description: 'Learn TypeScript from scratch',
  startDate: '2025-01-01',
};

function futureDate(daysFromNow = 30): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString();
}

function validHomeworkBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'Homework 1',
    description: 'Solve the exercises',
    type: 'coding',
    deadline: futureDate(),
    ...overrides,
  };
}

let app: Application;

beforeAll(async () => {
  await mongoose.connect(MONGO_URI);
  app = await createServer();
});

async function createCourse(overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await request(app)
    .post('/api/courses')
    .set('Authorization', AUTH)
    .set(TEACHER)
    .send({ ...VALID_COURSE_BODY, ...overrides });
  return (res.body.data as Record<string, unknown>)['id'] as string;
}

async function createHomework(
  courseId: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await request(app)
    .post(`/api/courses/${courseId}/homework`)
    .set('Authorization', AUTH)
    .set(TEACHER)
    .send(body);
  return res.body.data as Record<string, unknown>;
}

afterEach(async () => {
  await CourseModel.deleteMany({});
  await HomeworkModel.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
});

// ---------------------------------------------------------------------------
// 1. Auth + teacher gate
// ---------------------------------------------------------------------------

describe('Auth middleware — /api/courses/:courseId/homework', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const courseId = await createCourse();
    const res = await request(app).get(`/api/courses/${courseId}/homework`);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/courses/:courseId/homework — teacher gate', () => {
  it('returns 403 without X-Teacher header', async () => {
    const courseId = await createCourse();
    const res = await request(app)
      .post(`/api/courses/${courseId}/homework`)
      .set('Authorization', AUTH)
      .send(validHomeworkBody());

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('returns 201 with X-Teacher:true and valid body — id, createdAt present', async () => {
    const courseId = await createCourse();
    const res = await request(app)
      .post(`/api/courses/${courseId}/homework`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send(validHomeworkBody());

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const data = res.body.data as Record<string, unknown>;
    expect(typeof data['id']).toBe('string');
    expect(data['_id']).toBeUndefined();
    expect(data['createdAt']).toBeDefined();
    expect(data['title']).toBe('Homework 1');
    expect(data['courseId']).toBe(courseId);
  });
});

// ---------------------------------------------------------------------------
// 2. Create validation
// ---------------------------------------------------------------------------

describe('POST /api/courses/:courseId/homework — validation', () => {
  it('returns 422 for a bad type not in enum', async () => {
    const courseId = await createCourse();
    const res = await request(app)
      .post(`/api/courses/${courseId}/homework`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send(validHomeworkBody({ type: 'not-a-real-type' }));

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('returns 422 when title is missing', async () => {
    const courseId = await createCourse();
    const body = validHomeworkBody();
    delete body['title'];

    const res = await request(app)
      .post(`/api/courses/${courseId}/homework`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send(body);

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('returns 422 for a bad deadline', async () => {
    const courseId = await createCourse();
    const res = await request(app)
      .post(`/api/courses/${courseId}/homework`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send(validHomeworkBody({ deadline: 'not-a-date' }));

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Nested 404 (loadCourse guard)
// ---------------------------------------------------------------------------

describe('Nested homework routes — non-existent courseId', () => {
  it('POST returns 404 for a non-existent courseId', async () => {
    const fakeId = new mongoose.Types.ObjectId().toHexString();
    const res = await request(app)
      .post(`/api/courses/${fakeId}/homework`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send(validHomeworkBody());

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('GET (list) returns 404 for a non-existent courseId', async () => {
    const fakeId = new mongoose.Types.ObjectId().toHexString();
    const res = await request(app)
      .get(`/api/courses/${fakeId}/homework`)
      .set('Authorization', AUTH);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. GET /:id
// ---------------------------------------------------------------------------

describe('GET /api/courses/:courseId/homework/:id', () => {
  it('returns 200 for an existing homework', async () => {
    const courseId = await createCourse();
    const created = await createHomework(courseId, validHomeworkBody());
    const id = created['id'] as string;

    const res = await request(app)
      .get(`/api/courses/${courseId}/homework/${id}`)
      .set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect((res.body.data as Record<string, unknown>)['id']).toBe(id);
  });

  it('returns 404 for a non-existent homework id', async () => {
    const courseId = await createCourse();
    const fakeId = new mongoose.Types.ObjectId().toHexString();

    const res = await request(app)
      .get(`/api/courses/${courseId}/homework/${fakeId}`)
      .set('Authorization', AUTH);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. List — sorted by deadline asc, paginated envelope
// ---------------------------------------------------------------------------

describe('GET /api/courses/:courseId/homework — list', () => {
  it('returns paginated envelope with correct shape', async () => {
    const courseId = await createCourse();
    await createHomework(courseId, validHomeworkBody({ title: 'HW A', deadline: futureDate(10) }));
    await createHomework(courseId, validHomeworkBody({ title: 'HW B', deadline: futureDate(20) }));

    const res = await request(app)
      .get(`/api/courses/${courseId}/homework`)
      .set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data as Record<string, unknown>;
    expect(Array.isArray(data['data'])).toBe(true);
    expect(typeof data['total']).toBe('number');
    expect(typeof data['page']).toBe('number');
    expect(typeof data['limit']).toBe('number');
    expect(typeof data['totalPages']).toBe('number');
    expect(data['total']).toBe(2);
  });

  it('sorts by deadline ascending by default', async () => {
    const courseId = await createCourse();
    await createHomework(courseId, validHomeworkBody({ title: 'Later', deadline: futureDate(30) }));
    await createHomework(courseId, validHomeworkBody({ title: 'Sooner', deadline: futureDate(5) }));

    const res = await request(app)
      .get(`/api/courses/${courseId}/homework`)
      .set('Authorization', AUTH);

    expect(res.status).toBe(200);
    const items = (res.body.data as Record<string, unknown>)['data'] as Array<
      Record<string, unknown>
    >;
    expect(items[0]!['title']).toBe('Sooner');
    expect(items[1]!['title']).toBe('Later');
  });
});

// ---------------------------------------------------------------------------
// 6. GET /api/homework/active
// ---------------------------------------------------------------------------

describe('GET /api/homework/active', () => {
  it('returns 404 when no active course exists', async () => {
    await createCourse({ isActive: false });

    const res = await request(app).get('/api/homework/active').set('Authorization', AUTH);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 200 with homework list when an active course exists', async () => {
    const courseId = await createCourse({ isActive: true });
    await createHomework(courseId, validHomeworkBody({ title: 'Active HW' }));

    const res = await request(app).get('/api/homework/active').set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data as Record<string, unknown>;
    const items = data['data'] as Array<Record<string, unknown>>;
    expect(data['total']).toBe(1);
    expect(items[0]!['title']).toBe('Active HW');
  });
});
