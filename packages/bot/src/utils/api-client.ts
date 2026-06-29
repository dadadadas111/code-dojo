import type { Student } from '@code-dojo/shared';
import { env } from '../config/env';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(env.API_URL + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.API_KEY}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let payload: { success: boolean; data?: T; error?: string };
  try {
    payload = (await res.json()) as { success: boolean; data?: T; error?: string };
  } catch {
    throw new ApiError(res.status, res.statusText || 'Request failed');
  }

  if (!res.ok || payload.success === false) {
    throw new ApiError(res.status, payload.error ?? 'Request failed');
  }

  return payload.data as T;
}

export async function registerStudent(discordId: string, displayName: string): Promise<Student> {
  return request<Student>('POST', '/api/students', { discordId, displayName });
}

export async function getStudentByDiscord(discordId: string): Promise<Student> {
  return request<Student>('GET', `/api/students/by-discord/${discordId}`);
}

export async function getStudentById(id: string): Promise<Student> {
  return request<Student>('GET', `/api/students/${id}`);
}
