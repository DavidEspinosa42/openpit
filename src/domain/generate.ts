import type {
  ScheduleDay,
  SchoolConfig,
  Session,
  TrackClosure,
  VehicleUnavailability,
} from "./types.ts";

/**
 * Seeded generator for synthetic days. Output depends only on the arguments, never on a
 * clock or on Math.random. Used by tests, benchmarks and the sample-data CLI.
 * Generated days are random, so they usually contain conflicts; that is the point.
 */

/** Small deterministic PRNG (mulberry32). Returns floats in [0, 1). */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GenerateDayOptions {
  readonly seed: number;
  readonly date: string;
  readonly sessionCount: number;
  /** Number of track closures to add. Default 1. */
  readonly closureCount?: number;
  /** Number of vehicle unavailability windows to add. Default 2. */
  readonly unavailabilityCount?: number;
}

export function generateDay(config: SchoolConfig, options: GenerateDayOptions): ScheduleDay {
  const random = createRandom(options.seed);
  const grid = config.gridMinutes;
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
  const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const onGrid = (minute: number) => Math.round(minute / grid) * grid;
  const { startMinute: opens, endMinute: closes } = config.circuit.operatingHours;

  const sessions: Session[] = [];
  for (let i = 0; i < options.sessionCount; i++) {
    const activity = pick(config.activityTypes);
    const duration = Math.max(grid, onGrid(int(30, 120)));
    const earliest = activity.usesTrack ? opens : Math.max(0, opens - 60);
    const latest = Math.min(1440, activity.usesTrack ? closes : closes + 60) - duration;
    const start = Math.min(onGrid(int(earliest, Math.max(earliest, latest))), 1440 - duration);
    const vehicleCount = int(0, 4);
    const vehicleIds = new Set<string>();
    for (let v = 0; v < vehicleCount && config.vehicles.length > 0; v++) {
      vehicleIds.add(pick(config.vehicles).id);
    }
    const pitBoxIds = new Set<string>();
    const pitCount = config.pitBoxes.length > 0 ? int(0, 2) : 0;
    for (let p = 0; p < pitCount; p++) pitBoxIds.add(pick(config.pitBoxes).id);
    sessions.push({
      id: `gen-${String(i + 1).padStart(4, "0")}`,
      label: `Generated session ${i + 1}`,
      activityTypeId: activity.id,
      layoutId: activity.usesTrack ? pick(config.circuit.layouts).id : null,
      startMinute: start,
      endMinute: start + duration,
      vehicleIds: [...vehicleIds],
      pitBoxIds: [...pitBoxIds],
      status: random() < 0.05 ? "cancelled" : "planned",
    });
  }

  const closures: TrackClosure[] = [];
  for (let i = 0; i < (options.closureCount ?? 1); i++) {
    const start = onGrid(int(opens, closes - 60));
    closures.push({
      id: `gen-closure-${i + 1}`,
      sectionId: pick(config.circuit.sections).id,
      startMinute: start,
      endMinute: start + 60,
      reason: "Generated closure",
    });
  }

  const unavailabilities: VehicleUnavailability[] = [];
  for (let i = 0; i < (options.unavailabilityCount ?? 2) && config.vehicles.length > 0; i++) {
    const start = onGrid(int(opens, closes - 60));
    unavailabilities.push({
      id: `gen-unavail-${i + 1}`,
      vehicleId: pick(config.vehicles).id,
      startMinute: start,
      endMinute: start + 60,
      reason: "Generated window",
    });
  }

  return { date: options.date, revision: 0, sessions, closures, unavailabilities };
}
