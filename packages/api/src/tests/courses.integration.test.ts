/**
 * Integration tests for the Course API (Phase 2).
 *
 * Setup notes:
 * - Env vars are injected in src/tests/setup.ts (loaded before any app module).
 * - Each test suite connects to MongoDB (code-dojo-test database).
 * - afterEach clears both courses and lessons collections so tests are fully isolated.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import mongoose from 'mongoose';

import { createServer } from '../app';
import { CourseModel } from '../db/models/course.model';
import { LessonModel } from '../db/models/lesson.model';

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
  await CourseModel.deleteMany({});
  await LessonModel.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
});

// ---------------------------------------------------------------------------
// 1. Auth
// ---------------------------------------------------------------------------

describe('Auth middleware — /api/courses', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app).get('/api/courses');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Teacher gate (POST /api/courses)
// ---------------------------------------------------------------------------

describe('POST /api/courses — teacher gate', () => {
  it('returns 403 without X-Teacher header', async () => {
    const res = await request(app)
      .post('/api/courses')
      .set('Authorization', AUTH)
      .send(VALID_COURSE_BODY);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('returns 201 with X-Teacher:true and valid body — id, createdAt present, _id absent, isActive defaults true', async () => {
    const res = await request(app)
      .post('/api/courses')
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send(VALID_COURSE_BODY);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const data = res.body.data as Record<string, unknown>;
    expect(typeof data['id']).toBe('string');
    expect(data['_id']).toBeUndefined();
    expect(data['createdAt']).toBeDefined();
    expect(data['isActive']).toBe(true);
    expect(data['name']).toBe('TypeScript Fundamentals');
  });
});

// ---------------------------------------------------------------------------
// 3. Create validation
// ---------------------------------------------------------------------------

describe('POST /api/courses — validation', () => {
  it('returns 422 when name is missing', async () => {
    const res = await request(app)
      .post('/api/courses')
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ description: 'No name here', startDate: '2025-01-01' });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('returns 422 when startDate is not a valid date', async () => {
    const res = await request(app)
      .post('/api/courses')
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ name: 'Bad Date Course', description: 'desc', startDate: 'not-a-date' });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. GET /:id
// ---------------------------------------------------------------------------

describe('GET /api/courses/:id', () => {
  it('returns 200 for an existing course', async () => {
    const created = await request(app)
      .post('/api/courses')
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send(VALID_COURSE_BODY);

    const id = (created.body.data as Record<string, unknown>)['id'] as string;

    const res = await request(app).get(`/api/courses/${id}`).set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect((res.body.data as Record<string, unknown>)['id']).toBe(id);
  });

  it('returns 404 for a valid-shaped but non-existent ObjectId', async () => {
    const fakeId = new mongoose.Types.ObjectId().toHexString();
    const res = await request(app).get(`/api/courses/${fakeId}`).set('Authorization', AUTH);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 for a malformed (non-ObjectId) id', async () => {
    const res = await request(app).get('/api/courses/not-a-valid-id').set('Authorization', AUTH);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. GET /active
// ---------------------------------------------------------------------------

describe('GET /api/courses/active', () => {
  it('returns 200 with the active course when one exists', async () => {
    await request(app)
      .post('/api/courses')
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ ...VALID_COURSE_BODY, isActive: true });

    const res = await request(app).get('/api/courses/active').set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect((res.body.data as Record<string, unknown>)['isActive']).toBe(true);
  });

  it('returns 404 when no active course exists', async () => {
    await request(app)
      .post('/api/courses')
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ ...VALID_COURSE_BODY, isActive: false });

    const res = await request(app).get('/api/courses/active').set('Authorization', AUTH);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns the course with the later startDate when two active courses exist (tiebreak)', async () => {
    await request(app)
      .post('/api/courses')
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ name: 'Older Course', description: 'desc', startDate: '2024-01-01', isActive: true });

    await request(app)
      .post('/api/courses')
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ name: 'Newer Course', description: 'desc', startDate: '2025-06-01', isActive: true });

    const res = await request(app).get('/api/courses/active').set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect((res.body.data as Record<string, unknown>)['name']).toBe('Newer Course');
  });
});

// ---------------------------------------------------------------------------
// 6. GET / — list
// ---------------------------------------------------------------------------

describe('GET /api/courses — list', () => {
  it('returns paginated envelope with correct shape', async () => {
    await request(app)
      .post('/api/courses')
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ name: 'Course A', description: 'desc', startDate: '2025-01-01' });

    await request(app)
      .post('/api/courses')
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ name: 'Course B', description: 'desc', startDate: '2025-02-01' });

    const res = await request(app).get('/api/courses').set('Authorization', AUTH);

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

  it('?isActive=true filters out inactive courses', async () => {
    await request(app).post('/api/courses').set('Authorization', AUTH).set(TEACHER).send({
      name: 'Active Course',
      description: 'desc',
      startDate: '2025-01-01',
      isActive: true,
    });

    await request(app).post('/api/courses').set('Authorization', AUTH).set(TEACHER).send({
      name: 'Inactive Course',
      description: 'desc',
      startDate: '2025-02-01',
      isActive: false,
    });

    const res = await request(app).get('/api/courses?isActive=true').set('Authorization', AUTH);

    expect(res.status).toBe(200);
    const data = res.body.data as Record<string, unknown>;
    expect(data['total']).toBe(1);

    const courses = data['data'] as Array<Record<string, unknown>>;
    expect(courses[0]!['name']).toBe('Active Course');
  });
});

// ---------------------------------------------------------------------------
// 7. PATCH /:id — update
// ---------------------------------------------------------------------------

describe('PATCH /api/courses/:id — update', () => {
  it('updates isActive to false when teacher sends the request', async () => {
    const created = await request(app)
      .post('/api/courses')
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send(VALID_COURSE_BODY);

    const id = (created.body.data as Record<string, unknown>)['id'] as string;

    const res = await request(app)
      .patch(`/api/courses/${id}`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect((res.body.data as Record<string, unknown>)['isActive']).toBe(false);
  });

  it('returns 403 without X-Teacher header', async () => {
    const created = await request(app)
      .post('/api/courses')
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send(VALID_COURSE_BODY);

    const id = (created.body.data as Record<string, unknown>)['id'] as string;

    const res = await request(app)
      .patch(`/api/courses/${id}`)
      .set('Authorization', AUTH)
      .send({ isActive: false });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 for a non-existent course id', async () => {
    const fakeId = new mongoose.Types.ObjectId().toHexString();

    const res = await request(app)
      .patch(`/api/courses/${fakeId}`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ isActive: false });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
