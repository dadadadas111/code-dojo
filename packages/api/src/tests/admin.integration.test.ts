/**
 * Integration tests for the admin reset endpoint (bot /reset dev utility).
 *
 * Setup notes:
 * - Env vars are injected in src/tests/setup.ts (loaded before any app module).
 * - Each test suite connects to MongoDB (code-dojo-test database).
 * - Reset wipes class data but must NOT touch guild config.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import mongoose from 'mongoose';

import { createServer } from '../app';
import { StudentModel } from '../db/models/student.model';
import { CourseModel } from '../db/models/course.model';
import { GuildConfigModel } from '../db/models/guildconfig.model';

const VALID_KEY = 'test-api-key-0123456789';
const AUTH = `Bearer ${VALID_KEY}`;
const MONGO_URI = 'mongodb://localhost:27017/code-dojo-test';

let app: Application;

beforeAll(async () => {
  await mongoose.connect(MONGO_URI);
  app = await createServer();
});

afterAll(async () => {
  await mongoose.disconnect();
});

afterEach(async () => {
  await Promise.all([
    StudentModel.deleteMany({}),
    CourseModel.deleteMany({}),
    GuildConfigModel.deleteMany({}),
  ]);
});

describe('POST /api/admin/reset', () => {
  it('wipes class data and reports counts, but keeps guild config', async () => {
    await request(app)
      .post('/api/students')
      .set('Authorization', AUTH)
      .send({ discordId: '999999999999999999', displayName: 'Reset Test' });
    await GuildConfigModel.create({ guildId: '111111111111111111' });

    const res = await request(app).post('/api/admin/reset').set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deleted.students).toBe(1);
    expect(res.body.data.deleted).toHaveProperty('courses');
    expect(res.body.data.deleted).toHaveProperty('submissions');

    expect(await StudentModel.countDocuments()).toBe(0);
    expect(await GuildConfigModel.countDocuments()).toBe(1);
  });

  it('rejects requests without an API key', async () => {
    const res = await request(app).post('/api/admin/reset');
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/guild-config/:guildId', () => {
  it('deletes existing config and reports deleted=true', async () => {
    await GuildConfigModel.create({ guildId: '111111111111111111' });

    const res = await request(app)
      .delete('/api/guild-config/111111111111111111')
      .set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);
    expect(await GuildConfigModel.countDocuments()).toBe(0);
  });

  it('is idempotent — deleted=false when nothing was stored', async () => {
    const res = await request(app)
      .delete('/api/guild-config/111111111111111111')
      .set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(false);
  });
});
