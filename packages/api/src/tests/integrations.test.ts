/**
 * Tests for the LeetCode import + GitHub link validation (slice 2).
 *
 * Network is never hit: global fetch is stubbed per test. Pure helpers
 * (slug/URL parsing, reward mapping) are tested directly.
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
import { extractSlug, REWARDS_BY_DIFFICULTY } from '../services/leetcode.service';
import { parseRepoUrl } from '../services/github.service';

const VALID_KEY = 'test-api-key-0123456789';
const AUTH = `Bearer ${VALID_KEY}`;
const TEACHER = { 'X-Teacher': 'true' };
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
  vi.restoreAllMocks();
  await Promise.all([
    CourseModel.deleteMany({}),
    HomeworkModel.deleteMany({}),
    StudentModel.deleteMany({}),
    SubmissionModel.deleteMany({}),
  ]);
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function createCourse(): Promise<string> {
  const res = await request(app)
    .post('/api/courses')
    .set('Authorization', AUTH)
    .set(TEACHER)
    .send({ name: 'C', description: 'x', startDate: '2030-01-01' });
  return res.body.data.id as string;
}

describe('leetcode helpers', () => {
  it('extracts slugs from URLs and bare slugs', () => {
    expect(extractSlug('two-sum')).toBe('two-sum');
    expect(extractSlug('https://leetcode.com/problems/Two-Sum/description/')).toBe('two-sum');
    expect(() => extractSlug('https://example.com/foo')).toThrow();
  });

  it('maps difficulty to sensible rewards', () => {
    expect(REWARDS_BY_DIFFICULTY.Easy.xp).toBeLessThan(REWARDS_BY_DIFFICULTY.Hard.xp);
  });
});

describe('homework create with leetcodeSlug', () => {
  it('imports title/description/rewards/source from LeetCode', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: {
          question: {
            title: 'Two Sum',
            titleSlug: 'two-sum',
            difficulty: 'Easy',
            topicTags: [{ name: 'Array' }, { name: 'Hash Table' }],
          },
        },
      }),
    );

    const courseId = await createCourse();
    const res = await request(app)
      .post(`/api/courses/${courseId}/homework`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ leetcodeSlug: 'two-sum', deadline: '2030-02-01' });

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('[LeetCode] Two Sum');
    expect(res.body.data.type).toBe('coding');
    expect(res.body.data.xpReward).toBe(REWARDS_BY_DIFFICULTY.Easy.xp);
    expect(res.body.data.coinReward).toBe(REWARDS_BY_DIFFICULTY.Easy.coins);
    expect(res.body.data.source.type).toBe('leetcode');
    expect(res.body.data.source.slug).toBe('two-sum');
    expect(res.body.data.description).toContain('leetcode.com/problems/two-sum');
  });

  it('404s when the problem does not exist', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: { question: null } }));

    const courseId = await createCourse();
    const res = await request(app)
      .post(`/api/courses/${courseId}/homework`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ leetcodeSlug: 'no-such-problem', deadline: '2030-02-01' });
    expect(res.status).toBe(404);
  });

  it('still requires title/description/type without leetcodeSlug', async () => {
    const courseId = await createCourse();
    const res = await request(app)
      .post(`/api/courses/${courseId}/homework`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ deadline: '2030-02-01' });
    expect(res.status).toBe(422);
  });
});

describe('github link validation on submit', () => {
  it('parses owner/repo from URLs', () => {
    expect(parseRepoUrl('https://github.com/foo/bar')).toEqual({ owner: 'foo', repo: 'bar' });
    expect(parseRepoUrl('https://github.com/foo/bar.git')).toEqual({ owner: 'foo', repo: 'bar' });
    expect(() => parseRepoUrl('https://gitlab.com/foo/bar')).toThrow();
  });

  async function seedHomework(): Promise<string> {
    const courseId = await createCourse();
    const hw = await request(app)
      .post(`/api/courses/${courseId}/homework`)
      .set('Authorization', AUTH)
      .set(TEACHER)
      .send({ title: 'HW', description: 'x', type: 'coding', deadline: '2030-02-01' });
    await request(app)
      .post('/api/students')
      .set('Authorization', AUTH)
      .send({ discordId: '888888888888888888', displayName: 'Dev' });
    return hw.body.data.id as string;
  }

  it('rejects a 404 repo with a helpful message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, 404));
    const homeworkId = await seedHomework();

    const res = await request(app).post('/api/submissions').set('Authorization', AUTH).send({
      discordId: '888888888888888888',
      homeworkId,
      githubLink: 'https://github.com/nope/missing',
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toContain('nope/missing');
  });

  it('fails open when GitHub is rate-limited or down', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, 403));
    const homeworkId = await seedHomework();

    const res = await request(app).post('/api/submissions').set('Authorization', AUTH).send({
      discordId: '888888888888888888',
      homeworkId,
      githubLink: 'https://github.com/real/repo',
    });
    expect(res.status).toBe(201);
  });
});
