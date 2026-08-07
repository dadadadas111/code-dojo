import mongoose from 'mongoose';
import type { Course, CourseSchedule, Lesson } from '@code-dojo/shared';
import { CourseModel } from '../db/models/course.model';
import { LessonModel } from '../db/models/lesson.model';
import { ConflictError, NotFoundError, ValidationError } from '../errors';

/**
 * Recurring-schedule engine: a course declares weekly {day, time} slots and
 * lessons snap onto consecutive slots, so teachers never type dates.
 * All slot math is timezone-aware via Intl (no date library dependency).
 */

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** UTC offset (ms) of `timeZone` at instant `at`, e.g. +7h for Asia/Ho_Chi_Minh. */
function tzOffsetMs(timeZone: string, at: Date): number {
  const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName');
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(part?.value ?? '');
  if (!match) return 0; // "GMT" exactly = UTC
  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) * 3600_000 + Number(match[3]) * 60_000);
}

/** The UTC instant for wall-clock (y, m, d, hh, mm) in `timeZone`. */
function zonedToUtc(
  y: number,
  m: number,
  d: number,
  hh: number,
  mm: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // One refinement pass handles DST transitions; fixed-offset zones converge immediately.
  const offset1 = tzOffsetMs(timeZone, new Date(guess));
  const offset2 = tzOffsetMs(timeZone, new Date(guess - offset1));
  return new Date(guess - offset2);
}

/** Wall-clock calendar fields of instant `at` as seen in `timeZone`. */
function wallClock(at: Date, timeZone: string): { y: number; m: number; d: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).formatToParts(at);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    y: Number(get('year')),
    m: Number(get('month')),
    d: Number(get('day')),
    day: weekdays.indexOf(get('weekday')),
  };
}

/** The next `count` slot instants strictly after `after`, in chronological order. */
export function nextSlots(schedule: CourseSchedule, after: Date, count: number): Date[] {
  const result: Date[] = [];
  // Walk day by day from `after`'s calendar date in the schedule's timezone.
  for (let i = 0; result.length < count && i < count * 14 + 21; i++) {
    const probe = new Date(after.getTime() + i * 86_400_000);
    const { y, m, d, day } = wallClock(probe, schedule.timezone);
    const daySlots = schedule.slots
      .filter((slot) => slot.day === day)
      .map((slot) => {
        const [hh, mm] = slot.time.split(':').map(Number);
        return zonedToUtc(y, m, d, hh ?? 0, mm ?? 0, schedule.timezone);
      })
      .filter((date) => date.getTime() > after.getTime())
      .sort((a, b) => a.getTime() - b.getTime());
    for (const date of daySlots) {
      if (result.length < count) result.push(date);
    }
  }
  return result;
}

/** The last slot instant strictly before `before`, or null if none within ~4 weeks. */
export function previousSlot(schedule: CourseSchedule, before: Date): Date | null {
  const windowStart = new Date(before.getTime() - 28 * 86_400_000);
  const candidates = nextSlots(schedule, windowStart, 60).filter(
    (d) => d.getTime() < before.getTime(),
  );
  return candidates.length > 0 ? (candidates[candidates.length - 1] ?? null) : null;
}

export function validateSchedule(schedule: CourseSchedule): void {
  if (schedule.slots.length === 0) {
    throw new ValidationError('Schedule needs at least one slot');
  }
  for (const slot of schedule.slots) {
    if (!Number.isInteger(slot.day) || slot.day < 0 || slot.day > 6) {
      throw new ValidationError(`Invalid slot day: ${slot.day} (expected 0-6)`);
    }
    if (!TIME_RE.test(slot.time)) {
      throw new ValidationError(`Invalid slot time: ${slot.time} (expected HH:mm)`);
    }
  }
  const seen = new Set(schedule.slots.map((s) => `${s.day}:${s.time}`));
  if (seen.size !== schedule.slots.length) {
    throw new ValidationError('Duplicate slots in schedule');
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: schedule.timezone });
  } catch {
    throw new ValidationError(`Unknown timezone: ${schedule.timezone}`);
  }
}

export async function setCourseSchedule(
  courseId: string,
  schedule: CourseSchedule,
): Promise<Course> {
  validateSchedule(schedule);
  let doc;
  try {
    doc = await CourseModel.findByIdAndUpdate(courseId, { schedule }, { new: true });
  } catch {
    throw new NotFoundError('Course not found');
  }
  if (!doc) throw new NotFoundError('Course not found');
  return doc.toJSON() as unknown as Course;
}

/** Auto-assign date for a new lesson: the next free slot after the latest scheduled lesson (or now). */
export async function assignNextSlotDate(courseId: string, now: Date = new Date()): Promise<Date> {
  const course = await CourseModel.findById(courseId);
  if (!course) throw new NotFoundError('Course not found');
  if (!course.schedule) {
    throw new ValidationError(
      'Course has no recurring schedule — set one with /schedule-set or pass scheduled_date',
    );
  }
  const latest = await LessonModel.findOne({ courseId }).sort({ scheduledDate: -1 });
  const after =
    latest && latest.scheduledDate.getTime() > now.getTime() ? latest.scheduledDate : now;
  const [slot] = nextSlots(course.schedule, after, 1);
  if (!slot) throw new ValidationError('Could not compute a next slot from the schedule');
  return slot;
}

export interface ShiftChange {
  lessonId: string;
  order: number;
  topic: string;
  from: Date;
  to: Date;
}

/**
 * Shifts all upcoming lessons (optionally starting at `fromOrder`) one slot
 * later (postpone) or earlier (undo). Completed/past lessons never move; the
 * whole tail cascades so the course stays consistent with the calendar.
 */
export async function shiftSchedule(
  courseId: string,
  direction: 'later' | 'earlier',
  fromOrder?: number,
  now: Date = new Date(),
): Promise<ShiftChange[]> {
  const course = await CourseModel.findById(courseId);
  if (!course) throw new NotFoundError('Course not found');
  if (!course.schedule) {
    throw new ValidationError('Course has no recurring schedule — set one with /schedule-set');
  }

  const filter: mongoose.FilterQuery<unknown> = { courseId, scheduledDate: { $gte: now } };
  if (fromOrder !== undefined) filter['order'] = { $gte: fromOrder };
  const lessons = await LessonModel.find(filter).sort({ order: 1 });
  if (lessons.length === 0) throw new NotFoundError('No upcoming lessons to shift');

  const first = lessons[0]!;
  let startSlot: Date;
  if (direction === 'later') {
    const [slot] = nextSlots(course.schedule, first.scheduledDate, 1);
    if (!slot) throw new ValidationError('Could not compute a next slot from the schedule');
    startSlot = slot;
  } else {
    const slot = previousSlot(course.schedule, first.scheduledDate);
    if (!slot) throw new ConflictError('No earlier slot exists to pull the schedule forward to');
    if (slot.getTime() <= now.getTime()) {
      throw new ConflictError('Cannot pull forward: the previous slot is already in the past');
    }
    startSlot = slot;
  }

  const newDates = [startSlot, ...nextSlots(course.schedule, startSlot, lessons.length - 1)];
  const changes: ShiftChange[] = [];
  for (let i = 0; i < lessons.length; i++) {
    const lesson = lessons[i]!;
    const to = newDates[i]!;
    if (to.getTime() === lesson.scheduledDate.getTime()) continue;
    changes.push({
      lessonId: String(lesson._id),
      order: lesson.order,
      topic: lesson.topic,
      from: lesson.scheduledDate,
      to,
    });
    lesson.scheduledDate = to;
    if (direction === 'later') {
      lesson.postponedCount += 1;
    } else {
      lesson.postponedCount = Math.max(0, lesson.postponedCount - 1);
    }
    await lesson.save();
  }
  return changes;
}

export type { Lesson };
