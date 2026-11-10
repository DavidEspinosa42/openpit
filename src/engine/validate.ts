import type { Conflict, ScheduleDay, SchoolConfig } from "../domain/types.ts";
import { compareConflicts } from "./conflict.ts";
import { buildContext } from "./context.ts";
import { pitRules } from "./rules-pit.ts";
import { trackRules } from "./rules-track.ts";
import { vehicleRules } from "./rules-vehicle.ts";

/**
 * Checks one day against the school configuration and returns every conflict, in a total
 * order. Pure: no I/O, clock, randomness or locale. Permuting the input arrays does not
 * change the output. Cancelled sessions are ignored. Never throws for scheduling conflicts.
 */
export function validateDay(config: SchoolConfig, day: ScheduleDay): Conflict[] {
  const ctx = buildContext(config, day);
  const unique = new Map<string, Conflict>();
  for (const conflict of [...trackRules(ctx), ...vehicleRules(ctx), ...pitRules(ctx)]) {
    unique.set(conflict.key, conflict);
  }
  return [...unique.values()].sort(compareConflicts);
}

export function hasBlocking(conflicts: readonly Conflict[]): boolean {
  return conflicts.some((c) => c.severity === "blocking");
}
