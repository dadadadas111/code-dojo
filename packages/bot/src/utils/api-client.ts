import type { Course, Lesson, PaginatedResponse, Student } from '@code-dojo/shared';
import { env } from '../config/env';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface RequestOptions {
  teacher?: boolean;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts?: RequestOptions,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${env.API_KEY}`,
  };

  if (opts?.teacher) {
    headers['X-Teacher'] = 'true';
  }

  const res = await fetch(env.API_URL + path, {
    method,
    headers,
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

// ---- Student ----

export async function registerStudent(discordId: string, displayName: string): Promise<Student> {
  return request<Student>('POST', '/api/students', { discordId, displayName });
}

export async function getStudentByDiscord(discordId: string): Promise<Student> {
  return request<Student>('GET', `/api/students/by-discord/${discordId}`);
}

export async function getStudentById(id: string): Promise<Student> {
  return request<Student>('GET', `/api/students/${id}`);
}

// ---- Course ----

export interface CreateCourseInput {
  name: string;
  description: string;
  startDate: string;
  endDate?: string | null;
  isActive?: boolean;
}

export async function createCourse(input: CreateCourseInput): Promise<Course> {
  return request<Course>('POST', '/api/courses', input, { teacher: true });
}

export async function getActiveCourse(): Promise<Course> {
  return request<Course>('GET', '/api/courses/active');
}

// ---- Lesson ----

export interface CreateLessonInput {
  order: number;
  topic: string;
  description: string;
  scheduledDate: string;
  slideUrl?: string | null;
  recordingUrl?: string | null;
}

export async function createLesson(courseId: string, input: CreateLessonInput): Promise<Lesson> {
  return request<Lesson>('POST', `/api/courses/${courseId}/lessons`, input, { teacher: true });
}

export async function getCourseLessons(courseId: string): Promise<Lesson[]> {
  const paginated = await request<PaginatedResponse<Lesson>>(
    'GET',
    `/api/courses/${courseId}/lessons`,
  );
  return paginated.data;
}

export async function getNextLesson(): Promise<Lesson> {
  return request<Lesson>('GET', '/api/lessons/next');
}
