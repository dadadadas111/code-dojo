/**
 * Integration tests for the recurring-schedule engine (bot /schedule-set,
 * /postpone, and auto-assigned lesson dates).
 *
 * Setup notes:
 * - Env vars are injected in src/tests/setup.ts (loaded before any app module).
 * - Each test suite connects to MongoDB (code-dojo-test database).
 * - Slot math uses Asia/Ho_Chi_Minh (UTC+7, no DST): 19:00 local = 12:00 UTC.
 * - Dates are placed far in the future so "upcoming lesson" filters (>= now)
 *   behave deterministically.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import mongoose from 'mongoose';

import { createServer } from '../app';
import { CourseModel } from '../db/models/course.model';
import { LessonModel } from '../db/models/lesson.model';
import { nextSlots, previousSlot } from '../services/schedule.service';

const VALID_KEY = 'test-api-key-0123456789';
const AUTH = `Bearer ${VALID_KEY}`;
const TEACHER = { 'X-Teacher': 'true' };
const MONGO_URI = 'mongodb://localhost:27017/code-dojo-test';

// Sat 08:00 + Mon 20:00, the exact real-world case from the proposal.
const SCHEDULE = {
  slots: [
    { day: 6, time: '08:00' },
    { day: 1, time: '20:00' },
  ],
  timezone: 'Asia/Ho_Chi_Minh',
};

let app: Application;

async function createCourse(): Promise<string> {
  const res = await request(app)
    .post('/api/courses')
    .set('Authorization', AUTH)
    .set(TEACHER)
    .send({ name: 'Schedule Test', description: 'x', startDate: '2030-01-01' });
  return res.body.data.id as string;
}

beforeAll(async () => {
  await mongoose.connect(MONGO_URI);
  app = await createServer();
});

afterAll(async () => {
  await mongoose.disconnect();
});

afterEach(async () => {
  await Promise.all([CourseModel.deleteMany({}), LessonModel.deleteMany({})]);
});

describe('slot math (nextSlots / previousSlot)', () => {
  // Wed 2030-01-02 is a reference point: next slots are Sat 04 Jan 08:00
  // (+7 -> 01:00Z) then Mon 06 Jan 20:00 (+7 -> 13:00Z).
  const after = new Date('2030-01-02T00:00:00Z');

  it('generates slots in chronological order across mixed day/time pairs', () => {
    const slots = nextSlots(SCHEDULE, after, 4);
    expect(slots.map((d) => d.toISOString())).toEqual([
      '2030-01-05T01:00:00.000Z', // Sat 05 Jan 08:00 +07
      '2030-01-07T13:00:00.000Z', // Mon 07 Jan 20:00 +07
      '2030-01-12T01:00:00.000Z',
      '2030-01-14T13:00:00.000Z',
    ]);
  });

  it('previousSlot returns the slot immediately before a date', () => {
    const prev = previousSlot(SCHEDULE, new Date('2030-01-12T01:00:00.000Z'));
    expect(prev?.toISOString()).toBe('2030-01-07T13:00:00.000Z');
  });
});

describe('PUT /api/courses/:id/schedule', () => {
  it('stores the schedule and returns it on the course', async () => {
    const courseId = await createCourse();
    const res = await request(app)
      .put(`/api/courses/${courseId}/schedule`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send(SCHEDULE);

    expect(res.status).toBe(200);
    expect(res.body.data.schedule.slots).toHaveLength(2);
    expect(res.body.data.schedule.timezone).toBe('Asia/Ho_Chi_Minh');
  });

  it('rejects malformed slots with 422', async () => {
    const courseId = await createCourse();
    const res = await request(app)
      .put(`/api/courses/${courseId}/schedule`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ slots: [{ day: 9, time: '25:99' }], timezone: 'Asia/Ho_Chi_Minh' });
    expect(res.status).toBe(422);
  });

  it('requires the teacher header', async () => {
    const courseId = await createCourse();
    const res = await request(app)
      .put(`/api/courses/${courseId}/schedule`)
      .set('Authorization', AUTH)
      .send(SCHEDULE);
    expect(res.status).toBe(403);
  });
});

describe('lesson auto-assign onto slots', () => {
  it('creates lessons without a date, snapping to consecutive slots', async () => {
    const courseId = await createCourse();
    await request(app)
      .put(`/api/courses/${courseId}/schedule`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send(SCHEDULE);

    const l1 = await request(app)
      .post(`/api/courses/${courseId}/lessons`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ order: 1, topic: 'Intro', description: 'x' });
    const l2 = await request(app)
      .post(`/api/courses/${courseId}/lessons`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ order: 2, topic: 'Variables', description: 'x' });

    expect(l1.status).toBe(201);
    expect(l2.status).toBe(201);
    const d1 = new Date(l1.body.data.scheduledDate);
    const d2 = new Date(l2.body.data.scheduledDate);
    expect(d2.getTime()).toBeGreaterThan(d1.getTime());
    // Both land exactly on configured weekday/time pairs (in +07).
    for (const d of [d1, d2]) {
      const local = new Date(d.getTime() + 7 * 3600_000);
      const key = `${local.getUTCDay()}:${String(local.getUTCHours()).padStart(2, '0')}`;
      expect(['6:08', '1:20']).toContain(key);
    }
  });

  it('rejects dateless lessons when the course has no schedule', async () => {
    const courseId = await createCourse();
    const res = await request(app)
      .post(`/api/courses/${courseId}/lessons`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ order: 1, topic: 'Intro', description: 'x' });
    expect(res.status).toBe(422);
  });
});

describe('POST /api/courses/:id/schedule/shift', () => {
  async function seedLessons(courseId: string): Promise<Date[]> {
    await request(app)
      .put(`/api/courses/${courseId}/schedule`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send(SCHEDULE);
    const dates: Date[] = [];
    for (let order = 1; order <= 3; order++) {
      const res = await request(app)
        .post(`/api/courses/${courseId}/lessons`)
        .set('Authorization', AUTH)
        .set(TEACHER)
        .send({ order, topic: `Lesson ${order}`, description: 'x' });
      dates.push(new Date(res.body.data.scheduledDate));
    }
    return dates;
  }

  it('postpone cascades every upcoming lesson one slot later', async () => {
    const courseId = await createCourse();
    const before = await seedLessons(courseId);

    const res = await request(app)
      .post(`/api/courses/${courseId}/schedule/shift`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ direction: 'later' });

    expect(res.status).toBe(200);
    expect(res.body.data.changes).toHaveLength(3);

    // Lesson 1 now sits on lesson 2's old slot, lesson 2 on lesson 3's old slot.
    const changes = res.body.data.changes as Array<{ order: number; to: string }>;
    expect(new Date(changes[0]!.to).getTime()).toBe(before[1]!.getTime());
    expect(new Date(changes[1]!.to).getTime()).toBe(before[2]!.getTime());

    const lessons = await LessonModel.find({ courseId }).sort({ order: 1 });
    expect(lessons.every((l) => l.postponedCount === 1)).toBe(true);
  });

  it('earlier reverses a postpone exactly', async () => {
    const courseId = await createCourse();
    const before = await seedLessons(courseId);

    await request(app)
      .post(`/api/courses/${courseId}/schedule/shift`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ direction: 'later' });
    const res = await request(app)
      .post(`/api/courses/${courseId}/schedule/shift`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ direction: 'earlier' });

    expect(res.status).toBe(200);
    const lessons = await LessonModel.find({ courseId }).sort({ order: 1 });
    expect(lessons.map((l) => l.scheduledDate.getTime())).toEqual(before.map((d) => d.getTime()));
    expect(lessons.every((l) => l.postponedCount === 0)).toBe(true);
  });

  it('shifts only from fromOrder onward', async () => {
    const courseId = await createCourse();
    const before = await seedLessons(courseId);

    const res = await request(app)
      .post(`/api/courses/${courseId}/schedule/shift`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ direction: 'later', fromOrder: 2 });

    expect(res.status).toBe(200);
    expect(res.body.data.changes).toHaveLength(2);
    const l1 = await LessonModel.findOne({ courseId, order: 1 });
    expect(l1!.scheduledDate.getTime()).toBe(before[0]!.getTime());
  });

  it('404s when there is nothing upcoming to shift', async () => {
    const courseId = await createCourse();
    await request(app)
      .put(`/api/courses/${courseId}/schedule`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send(SCHEDULE);

    const res = await request(app)
      .post(`/api/courses/${courseId}/schedule/shift`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ direction: 'later' });
    expect(res.status).toBe(404);
  });
});
