import type { ScheduleDay, SchoolConfig, Session, Suggestion } from "../domain/types.ts";
import { validateDay } from "./validate.ts";

export interface SuggestOptions {
  /** Maximum number of suggestions to return. Default 3. */
  readonly limit?: number;
}

/**
 * Proposes up to `limit` other start times for one session, keeping its duration, nearest to
 * the current start first (the earlier time wins a tie). A start is suggested only when moving
 * the session there leaves it with no blocking conflict; conflicts between other sessions are
 * unaffected by the move, so no new conflict appears elsewhere (invariant 5). Warnings do not
 * disqualify a start. Returns an empty list when no start works, or when the session is
 * unknown or cancelled. Pure and deterministic.
 *
 * Speed: pair rules only link sessions closer than the larger of the track clearance and the
 * longest vehicle turnaround, so each candidate is checked against just those neighbours.
 * Tests compare the result with a full `validateDay` of the moved day.
 */
export function suggestSlots(
  config: SchoolConfig,
  day: ScheduleDay,
  sessionId: string,
  options: SuggestOptions = {},
): Suggestion[] {
  const limit = Math.max(0, Math.floor(options.limit ?? 3));
  const session = day.sessions.find((s) => s.id === sessionId);
  if (!session || session.status === "cancelled" || limit === 0) return [];

  const grid = config.gridMinutes;
  const duration = session.endMinute - session.startMinute;
  const reach = Math.max(
    config.circuit.clearanceMinutes,
    ...config.categories.map((c) => c.turnaroundMinutes),
  );
  const others = day.sessions.filter((s) => s.id !== sessionId && s.status !== "cancelled");

  const starts: number[] = [];
  for (let start = 0; start + duration <= 1440; start += grid) {
    if (start !== session.startMinute) starts.push(start);
  }
  starts.sort((a, b) => {
    const distance = Math.abs(a - session.startMinute) - Math.abs(b - session.startMinute);
    return distance !== 0 ? distance : a - b;
  });

  const result: Suggestion[] = [];
  for (const start of starts) {
    const end = start + duration;
    const moved: Session = { ...session, startMinute: start, endMinute: end };
    const neighbours = others.filter(
      (s) => s.startMinute < end + reach && start < s.endMinute + reach,
    );
    const conflicts = validateDay(config, { ...day, sessions: [moved, ...neighbours] });
    const blocked = conflicts.some(
      (c) => c.severity === "blocking" && c.sessionIds.includes(sessionId),
    );
    if (!blocked) {
      result.push({
        sessionId,
        startMinute: start,
        endMinute: end,
        shiftMinutes: start - session.startMinute,
      });
      if (result.length >= limit) break;
    }
  }
  return result;
}
