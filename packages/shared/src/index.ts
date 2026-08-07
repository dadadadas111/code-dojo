/**
 * @code-dojo/shared
 *
 * Shared types, constants, and utilities between API and Bot packages.
 * No business logic — only data structures and helpers.
 */

// ============================================
// Student
// ============================================

export interface Student {
  id: string;
  discordId: string;
  displayName: string;
  level: number;
  xp: number;
  coins: number;
  currentStreak: number;
  maxStreak: number;
  joinDate: Date;
  isActive: boolean;
}

// ============================================
// Course & Lesson
// ============================================

/** One recurring teaching slot. `day` uses JS Date.getDay() convention (0 = Sunday … 6 = Saturday); `time` is 24h "HH:mm" local to the schedule's timezone. */
export interface CourseScheduleSlot {
  day: number;
  time: string;
}

/** A course's fixed weekly rhythm — lessons snap onto these slots so teachers never type dates. */
export interface CourseSchedule {
  slots: CourseScheduleSlot[];
  timezone: string;
}

export interface Course {
  id: string;
  name: string;
  description: string;
  startDate: Date;
  endDate: Date | null;
  isActive: boolean;
  schedule: CourseSchedule | null;
  createdAt: Date;
}

export interface Lesson {
  id: string;
  courseId: string;
  order: number;
  topic: string;
  description: string;
  slideUrl: string | null;
  recordingUrl: string | null;
  scheduledDate: Date;
  /** Times this lesson was pushed to a later slot by /postpone (audit + 🔁 badge). */
  postponedCount: number;
}

// ============================================
// Homework & Submission
// ============================================

export type HomeworkType = 'quiz' | 'coding' | 'reading' | 'practice' | 'challenge';

export interface Homework {
  id: string;
  courseId: string;
  lessonId: string | null;
  title: string;
  description: string;
  type: HomeworkType;
  deadline: Date;
  xpReward: number;
  coinReward: number;
  maxScore: number;
  isActive: boolean;
  createdAt: Date;
}

export type SubmissionStatus = 'pending' | 'grading' | 'accepted' | 'revision' | 'late';

export interface Submission {
  id: string;
  homeworkId: string;
  studentId: string;
  content: string | null;
  githubLink: string | null;
  fileUrl: string | null;
  submittedAt: Date;
  status: SubmissionStatus;
  score: number | null;
  feedback: string | null;
  gradedAt: Date | null;
}

// ============================================
// Attendance
// ============================================

export type AttendanceStatus = 'present' | 'late' | 'absent';

export interface Attendance {
  id: string;
  lessonId: string;
  studentId: string;
  status: AttendanceStatus;
  checkinTime: Date | null;
}

// ============================================
// Gamification
// ============================================

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  xpReward: number;
  coinReward: number;
  condition: string; // JSON-serialized condition rule
}

export interface StudentAchievement {
  id: string;
  studentId: string;
  achievementId: string;
  earnedAt: Date;
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  cost: number;
  type: 'hint' | 'late_submission' | 'skip_quiz' | 'custom_role' | 'cosmetic';
  isActive: boolean;
}

export interface Purchase {
  id: string;
  studentId: string;
  itemId: string;
  purchasedAt: Date;
  isUsed: boolean;
}

// ============================================
// Activity Log
// ============================================

export type ActivityType =
  | 'xp_earned'
  | 'coin_earned'
  | 'coin_spent'
  | 'level_up'
  | 'achievement_earned'
  | 'submission_created'
  | 'submission_graded'
  | 'attendance_checked'
  | 'streak_updated'
  | 'item_purchased';

export interface ActivityLog {
  id: string;
  studentId: string;
  type: ActivityType;
  description: string;
  amount: number | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

// ============================================
// Guild Config
// ============================================

/**
 * Per-guild Discord configuration created by the bot's /setup command.
 * Stored in Mongo so a fresh server needs no manual .env role/channel IDs.
 * Stored values win; matching env vars (TEACHER_ROLE_ID, LEVEL_ROLE_IDS,
 * LEVELUP_CHANNEL_ID) are the fallback for pre-/setup installs.
 */
export interface GuildConfig {
  guildId: string;
  teacherRoleId: string | null;
  /** Assigned automatically on /register; gates the student bot-command channels. */
  studentRoleId: string | null;
  levelRoleIds: Record<string, string>;
  levelupChannelId: string | null;
  /** #thông-báo — read-only feed for schedule changes, deadlines, announcements. */
  announceChannelId: string | null;
  /** #bài-tập — new homework is auto-posted here with a submit menu. */
  homeworkChannelId: string | null;
}

// ============================================
// Discord Interaction Types
// ============================================

export interface DiscordCommandContext {
  userId: string;
  guildId: string;
  channelId: string;
  commandName: string;
  options: Record<string, unknown>;
}

// ============================================
// API Types
// ============================================

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ============================================
// Level Constants
// ============================================

export const LEVEL_THRESHOLDS: Record<number, { xp: number; title: string }> = {
  1: { xp: 0, title: 'Beginner' },
  2: { xp: 300, title: 'Coder' },
  3: { xp: 700, title: 'Programmer' },
  4: { xp: 1200, title: 'Developer' },
  5: { xp: 2000, title: 'Master' },
  6: { xp: 3500, title: 'Legend' },
};

export function getLevelFromXp(xp: number): { level: number; title: string } {
  const levels = Object.entries(LEVEL_THRESHOLDS).sort((a, b) => b[1].xp - a[1].xp);
  for (const [level, data] of levels) {
    if (xp >= data.xp) {
      return { level: Number(level), title: data.title };
    }
  }
  return { level: 1, title: 'Beginner' };
}

// ============================================
// XP Rewards Constants
// ============================================

export const XP_REWARDS = {
  homework_complete: 100,
  homework_early: 30,
  attend_class: 20,
  help_others: 10,
  good_question: 15,
  daily_login: 5,
  achievement_bonus: 50,
} as const;

export const COIN_REWARDS = {
  homework_complete: 50,
  attend_class: 10,
  achievement_bonus: 30,
  daily_login: 5,
  streak_milestone: 100,
} as const;
