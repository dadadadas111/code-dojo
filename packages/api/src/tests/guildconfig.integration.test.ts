/**
 * Integration tests for Guild Config (bot /setup persistence).
 *
 * Setup notes:
 * - Env vars are injected in src/tests/setup.ts (loaded before any app module).
 * - Each test suite connects to MongoDB (code-dojo-test database).
 * - afterEach clears the guildconfigs collection so tests are fully isolated.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import mongoose from 'mongoose';

import { createServer } from '../app';
import { GuildConfigModel } from '../db/models/guildconfig.model';

const VALID_KEY = 'test-api-key-0123456789';
const AUTH = `Bearer ${VALID_KEY}`;
const MONGO_URI = 'mongodb://localhost:27017/code-dojo-test';

const GUILD_ID = '111111111111111111';

const FULL_BODY = {
  teacherRoleId: '222222222222222222',
  levelRoleIds: {
    '1': '333333333333333331',
    '2': '333333333333333332',
    '3': '333333333333333333',
  },
  levelupChannelId: '444444444444444444',
};

let app: Application;

beforeAll(async () => {
  await mongoose.connect(MONGO_URI);
  app = await createServer();
});

afterAll(async () => {
  await mongoose.disconnect();
});

afterEach(async () => {
  await GuildConfigModel.deleteMany({});
});

describe('PUT /api/guild-config/:guildId', () => {
  it('creates config on first save (upsert)', async () => {
    const res = await request(app)
      .put(`/api/guild-config/${GUILD_ID}`)
      .set('Authorization', AUTH)
      .send(FULL_BODY);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.guildId).toBe(GUILD_ID);
    expect(res.body.data.teacherRoleId).toBe(FULL_BODY.teacherRoleId);
    expect(res.body.data.levelRoleIds).toEqual(FULL_BODY.levelRoleIds);
    expect(res.body.data.levelupChannelId).toBe(FULL_BODY.levelupChannelId);
  });

  it('partially updates existing config without clobbering other fields', async () => {
    await request(app)
      .put(`/api/guild-config/${GUILD_ID}`)
      .set('Authorization', AUTH)
      .send(FULL_BODY);

    const res = await request(app)
      .put(`/api/guild-config/${GUILD_ID}`)
      .set('Authorization', AUTH)
      .send({ levelupChannelId: '555555555555555555' });

    expect(res.status).toBe(200);
    expect(res.body.data.levelupChannelId).toBe('555555555555555555');
    expect(res.body.data.teacherRoleId).toBe(FULL_BODY.teacherRoleId);
    expect(res.body.data.levelRoleIds).toEqual(FULL_BODY.levelRoleIds);
  });

  it('accepts explicit null to clear a field', async () => {
    await request(app)
      .put(`/api/guild-config/${GUILD_ID}`)
      .set('Authorization', AUTH)
      .send(FULL_BODY);

    const res = await request(app)
      .put(`/api/guild-config/${GUILD_ID}`)
      .set('Authorization', AUTH)
      .send({ levelupChannelId: null });

    expect(res.status).toBe(200);
    expect(res.body.data.levelupChannelId).toBeNull();
  });

  it('rejects a malformed levelRoleIds map with 422', async () => {
    const res = await request(app)
      .put(`/api/guild-config/${GUILD_ID}`)
      .set('Authorization', AUTH)
      .send({ levelRoleIds: { '1': '' } });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('rejects requests without an API key', async () => {
    const res = await request(app).put(`/api/guild-config/${GUILD_ID}`).send(FULL_BODY);

    expect(res.status).toBe(401);
  });
});

describe('GET /api/guild-config/:guildId', () => {
  it('returns saved config', async () => {
    await request(app)
      .put(`/api/guild-config/${GUILD_ID}`)
      .set('Authorization', AUTH)
      .send(FULL_BODY);

    const res = await request(app).get(`/api/guild-config/${GUILD_ID}`).set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.guildId).toBe(GUILD_ID);
    expect(res.body.data.levelRoleIds).toEqual(FULL_BODY.levelRoleIds);
  });

  it('returns 404 for an unconfigured guild', async () => {
    const res = await request(app).get(`/api/guild-config/${GUILD_ID}`).set('Authorization', AUTH);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
