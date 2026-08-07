import type { CourseSchedule } from '@code-dojo/shared';

/**
 * Vietnamese weekday shorthand <-> JS Date.getDay() numbers.
 * T2..T7 = Monday..Saturday, CN = Sunday.
 */
const DAY_BY_LABEL: Record<string, number> = {
  CN: 0,
  T2: 1,
  T3: 2,
  T4: 3,
  T5: 4,
  T6: 5,
  T7: 6,
};

const LABEL_BY_DAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** Parses "T7 08:00" / "cn 19:30" into a slot, or null if malformed. */
export function parseSlot(raw: string): { day: number; time: string } | null {
  const match = /^\s*(CN|T[2-7])\s+([01]?\d|2[0-3]):([0-5]\d)\s*$/i.exec(raw);
  if (!match) return null;
  const day = DAY_BY_LABEL[match[1]!.toUpperCase()];
  if (day === undefined) return null;
  return { day, time: `${match[2]!.padStart(2, '0')}:${match[3]!}` };
}

export function slotLabel(slot: { day: number; time: string }): string {
  return `${LABEL_BY_DAY[slot.day] ?? '?'} ${slot.time}`;
}

/** "T7 08:00 · T2 20:00" — the rhythm line shown in /schedule and /schedule-set. */
export function scheduleLabel(schedule: CourseSchedule): string {
  return schedule.slots.map(slotLabel).join(' · ');
}
