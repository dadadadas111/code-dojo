/**
 * Integration tests for the Lesson API (Phase 2).
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

function validLessonBody(order = 1, daysFromNow = 30) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return {
    order,
    topic: `Lesson ${order}`,
    description: `Description for lesson ${order}`,
    scheduledDate: d.toISOString(),
  };
}

async function createCourse(overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await request(app)
    .post('/api/courses')
    .set('Authorization', AUTH)
    .set(TEACHER)
    .send({ ...VALID_COURSE_BODY, ...overrides });
  return (res.body.data as Record<string, unknown>)['id'] as string;
}

async function createLesson(
  courseId: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await request(app)
    .post(`/api/courses/${courseId}/lessons`)
    .set('Authorization', AUTH)
    .set(TEACHER)
    .send(body);
  return res.body.data as Record<string, unknown>;
}

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
// 8. POST /api/courses/:courseId/lessons — create
// ---------------------------------------------------------------------------

describe('POST /api/courses/:courseId/lessons — create', () => {
  it('returns 201 with valid body and teacher header; courseId is a string, createdAt absent', async () => {
    const courseId = await createCourse();

    const res = await request(app)
      .post(`/api/courses/${courseId}/lessons`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send(validLessonBody(1));

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const data = res.body.data as Record<string, unknown>;
    expect(typeof data['id']).toBe('string');
    expect(data['_id']).toBeUndefined();
    expect(data['createdAt']).toBeUndefined();
    expect(data['courseId']).toBe(courseId);
    expect(data['order']).toBe(1);
  });

  it('returns 403 without X-Teacher header', async () => {
    const courseId = await createCourse();

    const res = await request(app)
      .post(`/api/courses/${courseId}/lessons`)
      .set('Authorization', AUTH)
      .send(validLessonBody(1));

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 when courseId does not exist (loadCourse middleware)', async () => {
    const fakeCourseId = new mongoose.Types.ObjectId().toHexString();

    const res = await request(app)
      .post(`/api/courses/${fakeCourseId}/lessons`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send(validLessonBody(1));

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 409 when a lesson with the same order already exists in the course', async () => {
    const courseId = await createCourse();
    await createLesson(courseId, validLessonBody(1));

    // Same order, different topic
    const res = await request(app)
      .post(`/api/courses/${courseId}/lessons`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ ...validLessonBody(1), topic: 'Duplicate Order' });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('returns 422 when topic is missing', async () => {
    const courseId = await createCourse();
    const { topic: _topic, ...bodyWithoutTopic } = validLessonBody(1);

    const res = await request(app)
      .post(`/api/courses/${courseId}/lessons`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send(bodyWithoutTopic);

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('returns 422 when scheduledDate is not a valid date', async () => {
    const courseId = await createCourse();

    const res = await request(app)
      .post(`/api/courses/${courseId}/lessons`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ order: 1, topic: 'Lesson 1', description: 'desc', scheduledDate: 'bad-date' });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 9. GET /api/courses/:courseId/lessons — list (sorted by order asc)
// ---------------------------------------------------------------------------

describe('GET /api/courses/:courseId/lessons — list', () => {
  it('returns 200 paginated response sorted by order asc (seeds out-of-order)', async () => {
    const courseId = await createCourse();

    // Seed lessons out of order deliberately
    await createLesson(courseId, validLessonBody(3, 90));
    await createLesson(courseId, validLessonBody(1, 30));
    await createLesson(courseId, validLessonBody(2, 60));

    const res = await request(app)
      .get(`/api/courses/${courseId}/lessons`)
      .set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data as Record<string, unknown>;
    expect(typeof data['total']).toBe('number');
    expect(data['total']).toBe(3);

    const lessons = data['data'] as Array<Record<string, unknown>>;
    const orders = lessons.map((l) => l['order'] as number);
    expect(orders).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// 10. GET /api/courses/:courseId/lessons/:id — get by id
// ---------------------------------------------------------------------------

describe('GET /api/courses/:courseId/lessons/:id', () => {
  it('returns 200 with the correct lesson', async () => {
    const courseId = await createCourse();
    const lesson = await createLesson(courseId, validLessonBody(1));
    const lessonId = lesson['id'] as string;

    const res = await request(app)
      .get(`/api/courses/${courseId}/lessons/${lessonId}`)
      .set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect((res.body.data as Record<string, unknown>)['id']).toBe(lessonId);
  });

  it('returns 404 for a valid-shaped but non-existent lesson id', async () => {
    const courseId = await createCourse();
    const fakeId = new mongoose.Types.ObjectId().toHexString();

    const res = await request(app)
      .get(`/api/courses/${courseId}/lessons/${fakeId}`)
      .set('Authorization', AUTH);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 for a malformed lesson id', async () => {
    const courseId = await createCourse();

    const res = await request(app)
      .get(`/api/courses/${courseId}/lessons/not-a-valid-id`)
      .set('Authorization', AUTH);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 11. GET /api/lessons/next
// ---------------------------------------------------------------------------

describe('GET /api/lessons/next', () => {
  it('returns 404 when there is no active course', async () => {
    // Create an inactive course — no active course exists
    await createCourse({ isActive: false });

    const res = await request(app).get('/api/lessons/next').set('Authorization', AUTH);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns the future lesson when active course has a past and a future lesson', async () => {
    const courseId = await createCourse({ isActive: true });

    // Past lesson
    const past = new Date();
    past.setDate(past.getDate() - 10);
    await createLesson(courseId, {
      order: 1,
      topic: 'Past Lesson',
      description: 'Already happened',
      scheduledDate: past.toISOString(),
    });

    // Future lesson
    const future = new Date();
    future.setDate(future.getDate() + 14);
    await createLesson(courseId, {
      order: 2,
      topic: 'Future Lesson',
      description: 'Coming up',
      scheduledDate: future.toISOString(),
    });

    const res = await request(app).get('/api/lessons/next').set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect((res.body.data as Record<string, unknown>)['topic']).toBe('Future Lesson');
  });

  it('returns 404 when active course has only past lessons', async () => {
    const courseId = await createCourse({ isActive: true });

    const past = new Date();
    past.setDate(past.getDate() - 5);
    await createLesson(courseId, {
      order: 1,
      topic: 'Old Lesson',
      description: 'Already done',
      scheduledDate: past.toISOString(),
    });

    const res = await request(app).get('/api/lessons/next').set('Authorization', AUTH);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
