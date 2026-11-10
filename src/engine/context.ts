import type {
  ActivityType,
  PitBox,
  ScheduleDay,
  SchoolConfig,
  Session,
  TrackClosure,
  TrackLayout,
  Vehicle,
  VehicleCategory,
  VehicleUnavailability,
} from "../domain/types.ts";
import { compareStrings } from "./conflict.ts";

/**
 * Immutable lookup tables built once per validation. Input arrays are sorted by id so the
 * result never depends on input order (invariant 2). Unknown references are tolerated by
 * the rules (they skip) because integrity is checked on import, not here.
 */
export interface Context {
  readonly config: SchoolConfig;
  /** Non-cancelled sessions, sorted by id. */
  readonly sessions: readonly Session[];
  readonly closures: readonly TrackClosure[];
  readonly unavailabilities: readonly VehicleUnavailability[];
  readonly activities: ReadonlyMap<string, ActivityType>;
  readonly layouts: ReadonlyMap<string, TrackLayout>;
  readonly categories: ReadonlyMap<string, VehicleCategory>;
  readonly vehicles: ReadonlyMap<string, Vehicle>;
  readonly pitBoxes: ReadonlyMap<string, PitBox>;
}

function byId<T extends { readonly id: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => compareStrings(a.id, b.id));
}

function indexById<T extends { readonly id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

export function buildContext(config: SchoolConfig, day: ScheduleDay): Context {
  return {
    config,
    sessions: byId(day.sessions.filter((s) => s.status !== "cancelled")),
    closures: byId(day.closures),
    unavailabilities: byId(day.unavailabilities),
    activities: indexById(config.activityTypes),
    layouts: indexById(config.circuit.layouts),
    categories: indexById(config.categories),
    vehicles: indexById(config.vehicles),
    pitBoxes: indexById(config.pitBoxes),
  };
}

/** The session's activity uses the track and names a known layout. */
export function trackLayoutOf(ctx: Context, session: Session): TrackLayout | undefined {
  const activity = ctx.activities.get(session.activityTypeId);
  if (!activity?.usesTrack || session.layoutId === null) return undefined;
  return ctx.layouts.get(session.layoutId);
}

/** Sorted sections shared by two layouts. */
export function sharedSections(a: TrackLayout, b: TrackLayout): string[] {
  const other = new Set(b.sectionIds);
  return a.sectionIds.filter((id) => other.has(id)).sort(compareStrings);
}

/** Sorted ids present in both lists. */
export function intersect(a: readonly string[], b: readonly string[]): string[] {
  const other = new Set(b);
  return a.filter((id) => other.has(id)).sort(compareStrings);
}
