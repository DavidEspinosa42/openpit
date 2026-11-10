import type {
  Conflict,
  ConflictCode,
  ScheduleDay,
  SchoolConfig,
  Session,
} from "../../src/domain/types.ts";

/** Small synthetic school used by the rule tests. Every value is fictional. */
export const config: SchoolConfig = {
  name: "Test School",
  gridMinutes: 5,
  circuit: {
    id: "circuit",
    name: "Test Circuit",
    sections: [
      { id: "a", name: "Section A" },
      { id: "b", name: "Section B" },
      { id: "c", name: "Section C" },
    ],
    layouts: [
      { id: "L1", name: "A+B", sectionIds: ["a", "b"], capacity: { car: 3, kart: 2 } },
      { id: "L2", name: "B+C", sectionIds: ["b", "c"], capacity: { car: 3 } },
      { id: "L3", name: "C", sectionIds: ["c"], capacity: { car: 1 } },
    ],
    operatingHours: { startMinute: 480, endMinute: 1080 },
    clearanceMinutes: 10,
  },
  categories: [
    { id: "car", name: "Cars", turnaroundMinutes: 15 },
    { id: "kart", name: "Karts", turnaroundMinutes: 10 },
  ],
  vehicles: [
    { id: "car1", name: "Car 1", categoryId: "car", status: "available" },
    { id: "car2", name: "Car 2", categoryId: "car", status: "available" },
    { id: "car3", name: "Car 3", categoryId: "car", status: "available" },
    { id: "car4", name: "Car 4", categoryId: "car", status: "available" },
    { id: "carm", name: "Car in maintenance", categoryId: "car", status: "maintenance" },
    { id: "kart1", name: "Kart 1", categoryId: "kart", status: "available" },
  ],
  activityTypes: [
    {
      id: "track",
      name: "Track",
      usesTrack: true,
      allowedCategoryIds: ["car"],
      mixingAllowed: false,
    },
    {
      id: "open",
      name: "Open",
      usesTrack: true,
      allowedCategoryIds: ["car", "kart"],
      mixingAllowed: true,
    },
    {
      id: "prep",
      name: "Prep",
      usesTrack: false,
      allowedCategoryIds: ["car", "kart"],
      mixingAllowed: true,
    },
    {
      id: "brief",
      name: "Briefing",
      usesTrack: false,
      allowedCategoryIds: [],
      mixingAllowed: true,
    },
  ],
  pitBoxes: [
    { id: "p1", name: "Pit 1", capacity: 2 },
    { id: "p2", name: "Pit 2", capacity: 1 },
  ],
};

export interface SessionOptions {
  activity?: string;
  layout?: string | null;
  vehicles?: string[];
  pits?: string[];
  status?: "planned" | "cancelled";
}

/** Builds a session. Defaults to a "track" session on L1 with one available car. */
export function ses(
  id: string,
  startMinute: number,
  endMinute: number,
  o: SessionOptions = {},
): Session {
  const activity = o.activity ?? "track";
  const onTrack = activity === "track" || activity === "open";
  return {
    id,
    label: id,
    activityTypeId: activity,
    layoutId: o.layout === undefined ? (onTrack ? "L1" : null) : o.layout,
    startMinute,
    endMinute,
    vehicleIds: o.vehicles ?? ["car1"],
    pitBoxIds: o.pits ?? [],
    status: o.status ?? "planned",
  };
}

export function makeDay(
  sessions: Session[],
  extra: Partial<Pick<ScheduleDay, "closures" | "unavailabilities">> = {},
): ScheduleDay {
  return {
    date: "2026-06-13",
    revision: 0,
    sessions,
    closures: extra.closures ?? [],
    unavailabilities: extra.unavailabilities ?? [],
  };
}

export function codes(conflicts: readonly Conflict[]): ConflictCode[] {
  return conflicts.map((c) => c.code);
}

export function only(conflicts: readonly Conflict[], code: ConflictCode): Conflict[] {
  return conflicts.filter((c) => c.code === code);
}
