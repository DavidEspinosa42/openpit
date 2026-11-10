/**
 * Time model: integer minutes since midnight, half-open intervals [start, end).
 * See docs/adr/0002-minutes-since-midnight-time-model.md.
 */

export const MINUTES_PER_DAY = 1440;

export interface Interval {
  readonly startMinute: number;
  readonly endMinute: number;
}

/** True when the two half-open intervals share at least one minute. Touching intervals do not overlap. */
export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return a.startMinute < b.endMinute && b.startMinute < a.endMinute;
}

/**
 * Minutes between the end of the earlier interval and the start of the later one.
 * Returns 0 for touching intervals. Only meaningful for non-overlapping intervals;
 * overlapping intervals return a negative number.
 */
export function gapBetween(a: Interval, b: Interval): number {
  return a.startMinute <= b.startMinute ? b.startMinute - a.endMinute : a.startMinute - b.endMinute;
}

/** True when `inner` lies completely inside `outer`. */
export function intervalContains(outer: Interval, inner: Interval): boolean {
  return outer.startMinute <= inner.startMinute && inner.endMinute <= outer.endMinute;
}

export function isOnGrid(minute: number, gridMinutes: number): boolean {
  return Number.isInteger(minute) && minute % gridMinutes === 0;
}

/** Formats minutes since midnight as 24-hour HH:MM. 1440 formats as "24:00". */
export function formatMinute(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Parses "HH:MM" (24-hour, "24:00" allowed) to minutes since midnight, or null if invalid. */
export function parseTime(text: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (minutes > 59 || hours > 24) return null;
  const total = hours * 60 + minutes;
  return total <= MINUTES_PER_DAY ? total : null;
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isValidDateString(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (lengths[month - 1] as number);
}
