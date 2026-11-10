import { formatMinute } from "./time.ts";
import type { Conflict, ScheduleDay, SchoolConfig } from "./types.ts";

/**
 * Turns an engine conflict (code + parameters) into English text. The engine itself never
 * produces text; the UI and CLI call this so both show the same wording.
 */

export interface MessageLookup {
  sessionLabel(id: string): string;
  vehicleName(id: string): string;
  sectionName(id: string): string;
  pitBoxName(id: string): string;
  categoryName(id: string): string;
  layoutName(id: string): string;
}

export function createLookup(config: SchoolConfig, day: ScheduleDay): MessageLookup {
  const sessions = new Map(day.sessions.map((s) => [s.id, s.label || s.id]));
  const vehicles = new Map(config.vehicles.map((v) => [v.id, v.name]));
  const sections = new Map(config.circuit.sections.map((s) => [s.id, s.name]));
  const pitBoxes = new Map(config.pitBoxes.map((p) => [p.id, p.name]));
  const categories = new Map(config.categories.map((c) => [c.id, c.name]));
  const layouts = new Map(config.circuit.layouts.map((l) => [l.id, l.name]));
  return {
    sessionLabel: (id) => sessions.get(id) ?? id,
    vehicleName: (id) => vehicles.get(id) ?? id,
    sectionName: (id) => sections.get(id) ?? id,
    pitBoxName: (id) => pitBoxes.get(id) ?? id,
    categoryName: (id) => categories.get(id) ?? id,
    layoutName: (id) => layouts.get(id) ?? id,
  };
}

function resourceNames(conflict: Conflict, kind: string, name: (id: string) => string): string {
  return conflict.resources
    .filter((r) => r.kind === kind)
    .map((r) => name(r.id))
    .join(", ");
}

function num(conflict: Conflict, key: string): number {
  const value = conflict.params[key];
  return typeof value === "number" ? value : 0;
}

export function formatConflict(conflict: Conflict, lookup: MessageLookup): string {
  const [first, second] = conflict.sessionIds.map((id) => lookup.sessionLabel(id));
  const a = `"${first ?? ""}"`;
  const b = `"${second ?? ""}"`;
  const vehicle = resourceNames(conflict, "vehicle", lookup.vehicleName);
  const section = resourceNames(conflict, "section", lookup.sectionName);
  const pitBox = resourceNames(conflict, "pitBox", lookup.pitBoxName);
  const category = resourceNames(conflict, "category", lookup.categoryName);

  switch (conflict.code) {
    case "OUTSIDE_OPERATING_HOURS":
      return `${a} is outside operating hours (${formatMinute(num(conflict, "opensAt"))}-${formatMinute(num(conflict, "closesAt"))}).`;
    case "TRACK_SECTION_OVERLAP":
      return `${a} and ${b} use the same track section (${section}) at the same time, for ${num(conflict, "overlapMinutes")} min.`;
    case "TRACK_CLEARANCE_TOO_SHORT":
      return `${a} and ${b} share ${section} with only ${num(conflict, "gap")} min between them; ${num(conflict, "required")} min are required.`;
    case "TRACK_CLOSED":
      return `${a} uses ${section}, which is closed during the session.`;
    case "LAYOUT_CAPACITY_EXCEEDED": {
      const layout = resourceNames(conflict, "layout", lookup.layoutName);
      return `${a} has ${num(conflict, "count")} vehicle(s) of ${category} on ${layout}, which allows ${num(conflict, "capacity")}.`;
    }
    case "CATEGORY_NOT_ALLOWED":
      return `${a} includes ${vehicle} (${category}), which is not allowed for its activity.`;
    case "MIXED_CATEGORIES":
      return `${a} mixes vehicle categories (${category}), which its activity does not allow.`;
    case "VEHICLE_DOUBLE_BOOKED":
      return `${vehicle} is in ${a} and ${b} at the same time, for ${num(conflict, "overlapMinutes")} min.`;
    case "VEHICLE_UNAVAILABLE":
      return conflict.params.cause === "status"
        ? `${a} uses ${vehicle}, whose status is ${String(conflict.params.status)}.`
        : `${a} uses ${vehicle} during a period when it is unavailable.`;
    case "VEHICLE_TURNAROUND_TOO_SHORT":
      return `${vehicle} has only ${num(conflict, "gap")} min between ${a} and ${b}; ${num(conflict, "required")} min are required.`;
    case "PIT_BOX_DOUBLE_BOOKED":
      return `${pitBox} is used by ${a} and ${b} at the same time, for ${num(conflict, "overlapMinutes")} min.`;
    case "PIT_BOX_CAPACITY_EXCEEDED":
      return `${a} has ${num(conflict, "vehicles")} vehicle(s) but its pit boxes (${pitBox}) hold ${num(conflict, "capacity")}.`;
    case "NO_VEHICLES_ASSIGNED":
      return `${a} has no vehicles assigned.`;
  }
}

/** Short names for the rules, for headings in the UI and CLI. */
export const CONFLICT_TITLES: Record<Conflict["code"], string> = {
  OUTSIDE_OPERATING_HOURS: "Outside operating hours",
  TRACK_SECTION_OVERLAP: "Track section used twice",
  TRACK_CLEARANCE_TOO_SHORT: "Track clearance too short",
  TRACK_CLOSED: "Track section closed",
  LAYOUT_CAPACITY_EXCEEDED: "Layout capacity exceeded",
  CATEGORY_NOT_ALLOWED: "Vehicle category not allowed",
  MIXED_CATEGORIES: "Mixed vehicle categories",
  VEHICLE_DOUBLE_BOOKED: "Vehicle double-booked",
  VEHICLE_UNAVAILABLE: "Vehicle unavailable",
  VEHICLE_TURNAROUND_TOO_SHORT: "Vehicle turnaround too short",
  PIT_BOX_DOUBLE_BOOKED: "Pit box double-booked",
  PIT_BOX_CAPACITY_EXCEEDED: "Pit box capacity exceeded",
  NO_VEHICLES_ASSIGNED: "No vehicles assigned",
};
