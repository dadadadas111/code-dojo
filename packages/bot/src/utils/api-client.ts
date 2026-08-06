import type {
  Attendance,
  AttendanceStatus,
  Course,
  GuildConfig,
  Homework,
  HomeworkType,
  Lesson,
  PaginatedResponse,
  Student,
  Submission,
  SubmissionStatus,
} from '@code-dojo/shared';
import { env } from '../config/env';

export interface XpAward {
  xpAwarded: number;
  newXp: number;
  leveledUp: boolean;
  newLevel: number;
  newTitle: string;
  discordId: string;
}

export interface CoinAward {
  coinsAwarded: number;
  newBalance: number;
  discordId: string;
}

export interface LeaderboardEntry {
  rank: number;
  studentId: string;
  displayName: string;
  score: number;
}

export interface LeaderboardRank {
  rank: number;
  score: number;
  studentId: string;
  displayName: string;
}

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

// ---- Homework ----

export interface CreateHomeworkInput {
  title: string;
  description: string;
  type: HomeworkType;
  deadline: string;
  xpReward?: number;
  coinReward?: number;
  maxScore?: number;
  lessonId?: string;
}

export async function createHomework(
  courseId: string,
  input: CreateHomeworkInput,
): Promise<Homework> {
  return request<Homework>('POST', `/api/courses/${courseId}/homework`, input, {
    teacher: true,
  });
}

export async function getActiveHomework(): Promise<Homework[]> {
  const paginated = await request<PaginatedResponse<Homework>>('GET', '/api/homework/active');
  return paginated.data;
}

// ---- Submission ----

export interface CreateSubmissionInput {
  discordId: string;
  homeworkId: string;
  content?: string;
  githubLink?: string;
  fileUrl?: string;
}

export async function createSubmission(input: CreateSubmissionInput): Promise<Submission> {
  return request<Submission>('POST', '/api/submissions', input);
}

export interface ListSubmissionsQuery {
  homeworkId?: string;
  status?: SubmissionStatus;
  discordId?: string;
}

export async function listSubmissions(query: ListSubmissionsQuery = {}): Promise<Submission[]> {
  const params = new URLSearchParams();
  if (query.homeworkId) params.set('homeworkId', query.homeworkId);
  if (query.status) params.set('status', query.status);
  if (query.discordId) params.set('discordId', query.discordId);
  // Request a high limit so the /review pending list and /homework submitted-map
  // are not silently truncated by the API's default page size (20).
  params.set('limit', '100');

  const qs = params.toString();
  const paginated = await request<PaginatedResponse<Submission>>(
    'GET',
    `/api/submissions${qs ? `?${qs}` : ''}`,
  );
  return paginated.data;
}

export async function getSubmissionById(id: string): Promise<Submission> {
  return request<Submission>('GET', `/api/submissions/${id}`);
}

export interface GradeSubmissionInput {
  status: 'grading' | 'accepted' | 'revision';
  score?: number;
  feedback?: string;
}

export async function gradeSubmission(
  id: string,
  patch: GradeSubmissionInput,
): Promise<Submission & { xp: XpAward | null; coins: CoinAward | null }> {
  return request<Submission & { xp: XpAward | null; coins: CoinAward | null }>(
    'PATCH',
    `/api/submissions/${id}`,
    patch,
    { teacher: true },
  );
}

export interface ResubmitSubmissionInput {
  id: string;
  discordId: string;
  content?: string;
  githubLink?: string;
  fileUrl?: string;
}

export async function resubmitSubmission(input: ResubmitSubmissionInput): Promise<Submission> {
  const { id, ...body } = input;
  return request<Submission>('PATCH', `/api/submissions/${id}/resubmit`, body);
}

// ---- Attendance ----

export async function checkin(
  discordId: string,
): Promise<Attendance & { xp: XpAward | null; coins: CoinAward | null }> {
  return request<Attendance & { xp: XpAward | null; coins: CoinAward | null }>(
    'POST',
    '/api/attendance/checkin',
    { discordId },
  );
}

export interface LessonAttendance {
  attendances: Attendance[];
  stats: { present: number; late: number; absent: number; total: number };
}

export async function getLessonAttendance(lessonId: string): Promise<LessonAttendance> {
  return request<LessonAttendance>('GET', `/api/attendance/lesson/${lessonId}`, undefined, {
    teacher: true,
  });
}

export async function markAttendance(
  lessonId: string,
  discordId: string,
  status: AttendanceStatus,
): Promise<Attendance> {
  return request<Attendance>(
    'POST',
    `/api/attendance/lesson/${lessonId}/mark`,
    { discordId, status },
    { teacher: true },
  );
}

export async function getMyAttendance(discordId: string): Promise<Attendance[]> {
  return request<Attendance[]>('GET', `/api/attendance/student/by-discord/${discordId}`);
}

// ---- Guild Config ----

export interface GuildConfigInput {
  teacherRoleId?: string | null;
  levelRoleIds?: Record<string, string>;
  levelupChannelId?: string | null;
}

export async function fetchGuildConfig(guildId: string): Promise<GuildConfig> {
  return request<GuildConfig>('GET', `/api/guild-config/${guildId}`);
}

export async function saveGuildConfig(
  guildId: string,
  input: GuildConfigInput,
): Promise<GuildConfig> {
  return request<GuildConfig>('PUT', `/api/guild-config/${guildId}`, input);
}

// ---- Gamification ----

export type LeaderboardMetric = 'xp' | 'coins' | 'streak';

export async function getLeaderboard(
  metric: LeaderboardMetric,
  page = 1,
  limit = 10,
): Promise<PaginatedResponse<LeaderboardEntry>> {
  return request<PaginatedResponse<LeaderboardEntry>>(
    'GET',
    `/api/gamification/leaderboard/${metric}?page=${page}&limit=${limit}`,
  );
}

export async function getLeaderboardRank(
  metric: LeaderboardMetric,
  discordId: string,
): Promise<LeaderboardRank> {
  return request<LeaderboardRank>(
    'GET',
    `/api/gamification/leaderboard/${metric}/rank?discordId=${discordId}`,
  );
}
