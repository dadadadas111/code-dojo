/**
 * Integration tests for the Student Management API (Phase 1).
 *
 * Setup notes:
 * - Env vars are injected in src/tests/setup.ts (loaded before any app module).
 * - Each test suite connects to MongoDB (code-dojo-test database).
 * - afterEach clears the students collection so tests are fully isolated.
 * - Redis is NOT connected here — student routes don't use it; only /health does.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import mongoose from 'mongoose';

// App is imported AFTER env vars are set in setup.ts.
import { createServer } from '../app';
import { StudentModel } from '../db/models/student.model';

const VALID_KEY = 'test-api-key-0123456789';
const AUTH = `Bearer ${VALID_KEY}`;
const MONGO_URI = 'mongodb://localhost:27017/code-dojo-test';

let app: Application;

beforeAll(async () => {
  await mongoose.connect(MONGO_URI);
  app = await createServer();
});

afterEach(async () => {
  await StudentModel.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
});

// ---------------------------------------------------------------------------
// 1. Auth
// ---------------------------------------------------------------------------

describe('Auth middleware', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app).get('/api/students');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 when bearer token is wrong', async () => {
    const res = await request(app)
      .get('/api/students')
      .set('Authorization', 'Bearer wrong-token-that-is-not-right');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 when scheme is not Bearer', async () => {
    const res = await request(app).get('/api/students').set('Authorization', `Basic ${VALID_KEY}`);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Register (POST /api/students)
// ---------------------------------------------------------------------------

describe('POST /api/students — register', () => {
  it('registers a new student and returns defaults', async () => {
    const res = await request(app)
      .post('/api/students')
      .set('Authorization', AUTH)
      .send({ discordId: 'disc-001', displayName: 'Alice' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const data = res.body.data as Record<string, unknown>;
    expect(typeof data['id']).toBe('string');
    expect(data['_id']).toBeUndefined();
    expect(data['__v']).toBeUndefined();
    expect(data['discordId']).toBe('disc-001');
    expect(data['displayName']).toBe('Alice');
    // Defaults
    expect(data['level']).toBe(1);
    expect(data['xp']).toBe(0);
    expect(data['isActive']).toBe(true);
  });

  it('returns 409 when discordId is already registered', async () => {
    await request(app)
      .post('/api/students')
      .set('Authorization', AUTH)
      .send({ discordId: 'disc-dup', displayName: 'Bob' });

    const res = await request(app)
      .post('/api/students')
      .set('Authorization', AUTH)
      .send({ discordId: 'disc-dup', displayName: 'Bob 2' });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/already registered/i);
  });

  it('returns 422 when discordId is missing', async () => {
    const res = await request(app)
      .post('/api/students')
      .set('Authorization', AUTH)
      .send({ displayName: 'Charlie' });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('returns 422 when displayName is missing', async () => {
    const res = await request(app)
      .post('/api/students')
      .set('Authorization', AUTH)
      .send({ discordId: 'disc-003' });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('returns 422 when body is empty', async () => {
    const res = await request(app).post('/api/students').set('Authorization', AUTH).send({});

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Get by ID (GET /api/students/:id)
// ---------------------------------------------------------------------------

describe('GET /api/students/:id — get by id', () => {
  it('returns 200 with the correct student', async () => {
    const created = await request(app)
      .post('/api/students')
      .set('Authorization', AUTH)
      .send({ discordId: 'disc-getid', displayName: 'Dave' });

    const id = (created.body.data as Record<string, unknown>)['id'] as string;

    const res = await request(app).get(`/api/students/${id}`).set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect((res.body.data as Record<string, unknown>)['id']).toBe(id);
    expect((res.body.data as Record<string, unknown>)['discordId']).toBe('disc-getid');
  });

  it('returns 404 for a valid-shaped but non-existent ObjectId', async () => {
    const fakeId = new mongoose.Types.ObjectId().toHexString();
    const res = await request(app).get(`/api/students/${fakeId}`).set('Authorization', AUTH);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 for a malformed (non-ObjectId) id (CastError mapped)', async () => {
    const res = await request(app).get('/api/students/not-a-valid-id').set('Authorization', AUTH);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Get by Discord ID (GET /api/students/by-discord/:discordId)
// ---------------------------------------------------------------------------

describe('GET /api/students/by-discord/:discordId — get by discord id', () => {
  it('returns 200 with the matching student', async () => {
    await request(app)
      .post('/api/students')
      .set('Authorization', AUTH)
      .send({ discordId: 'disc-bydisc', displayName: 'Eve' });

    const res = await request(app)
      .get('/api/students/by-discord/disc-bydisc')
      .set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect((res.body.data as Record<string, unknown>)['discordId']).toBe('disc-bydisc');
  });

  it('returns 404 when discordId does not exist', async () => {
    const res = await request(app)
      .get('/api/students/by-discord/no-such-discord')
      .set('Authorization', AUTH);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. List (GET /api/students)
// ---------------------------------------------------------------------------

describe('GET /api/students — list', () => {
  async function seedStudents(count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      await request(app)
        .post('/api/students')
        .set('Authorization', AUTH)
        .send({ discordId: `disc-list-${i}`, displayName: `Student ${i}` });
    }
    // Patch a couple of students with distinct xp values so sort tests are meaningful
    const first = await StudentModel.findOne({ discordId: 'disc-list-0' });
    const second = await StudentModel.findOne({ discordId: 'disc-list-1' });
    if (first !== null) await StudentModel.findByIdAndUpdate(first._id, { xp: 100 });
    if (second !== null) await StudentModel.findByIdAndUpdate(second._id, { xp: 50 });
  }

  it('returns paginated envelope with correct shape', async () => {
    await seedStudents(5);

    const res = await request(app).get('/api/students').set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data as Record<string, unknown>;
    expect(Array.isArray(data['data'])).toBe(true);
    expect(typeof data['total']).toBe('number');
    expect(typeof data['page']).toBe('number');
    expect(typeof data['limit']).toBe('number');
    expect(typeof data['totalPages']).toBe('number');

    expect(data['total']).toBe(5);
    expect(data['page']).toBe(1);
  });

  it('respects the limit query parameter', async () => {
    await seedStudents(5);

    const res = await request(app).get('/api/students?limit=2').set('Authorization', AUTH);

    expect(res.status).toBe(200);
    const data = res.body.data as Record<string, unknown>;
    expect((data['data'] as unknown[]).length).toBe(2);
    expect(data['limit']).toBe(2);
    expect(data['totalPages']).toBe(3); // ceil(5/2)
  });

  it('sorts by xp descending correctly', async () => {
    await seedStudents(3);

    const res = await request(app)
      .get('/api/students?sort=xp&order=desc')
      .set('Authorization', AUTH);

    expect(res.status).toBe(200);
    const students = (res.body.data as Record<string, unknown>)['data'] as Array<
      Record<string, unknown>
    >;
    const xps = students.map((s) => s['xp'] as number);
    // Verify descending order
    for (let i = 0; i < xps.length - 1; i++) {
      expect(xps[i]).toBeGreaterThanOrEqual(xps[i + 1] as number);
    }
  });

  it('applies default pagination when no params provided', async () => {
    await seedStudents(3);

    const res = await request(app).get('/api/students').set('Authorization', AUTH);

    expect(res.status).toBe(200);
    const data = res.body.data as Record<string, unknown>;
    // Default page = 1, default limit = 20
    expect(data['page']).toBe(1);
    expect(data['limit']).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// 6. Patch (PATCH /api/students/:id)
// ---------------------------------------------------------------------------

describe('PATCH /api/students/:id — update', () => {
  it('updates displayName and reflects the change in the response', async () => {
    const created = await request(app)
      .post('/api/students')
      .set('Authorization', AUTH)
      .send({ discordId: 'disc-patch', displayName: 'Frank' });

    const id = (created.body.data as Record<string, unknown>)['id'] as string;

    const res = await request(app)
      .patch(`/api/students/${id}`)
      .set('Authorization', AUTH)
      .send({ displayName: 'Frank Updated' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect((res.body.data as Record<string, unknown>)['displayName']).toBe('Frank Updated');
  });

  it('updates isActive to false', async () => {
    const created = await request(app)
      .post('/api/students')
      .set('Authorization', AUTH)
      .send({ discordId: 'disc-deactivate', displayName: 'Grace' });

    const id = (created.body.data as Record<string, unknown>)['id'] as string;

    const res = await request(app)
      .patch(`/api/students/${id}`)
      .set('Authorization', AUTH)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect((res.body.data as Record<string, unknown>)['isActive']).toBe(false);
  });

  it('returns 404 for a non-existent id', async () => {
    const fakeId = new mongoose.Types.ObjectId().toHexString();
    const res = await request(app)
      .patch(`/api/students/${fakeId}`)
      .set('Authorization', AUTH)
      .send({ displayName: 'Ghost' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('does not update non-whitelisted fields (e.g. xp)', async () => {
    const created = await request(app)
      .post('/api/students')
      .set('Authorization', AUTH)
      .send({ discordId: 'disc-noxp', displayName: 'Heidi' });

    const id = (created.body.data as Record<string, unknown>)['id'] as string;

    // Attempt to patch xp — should be silently ignored (not in updateBody schema)
    await request(app).patch(`/api/students/${id}`).set('Authorization', AUTH).send({ xp: 9999 });

    // Re-fetch and confirm xp is still 0
    const res = await request(app).get(`/api/students/${id}`).set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect((res.body.data as Record<string, unknown>)['xp']).toBe(0);
  });
});
