import {
  CONFLICT_CODES,
  type Conflict,
  type ConflictCode,
  type ResourceRef,
  type Severity,
} from "../domain/types.ts";

const SEVERITY: Record<ConflictCode, Severity> = {
  OUTSIDE_OPERATING_HOURS: "blocking",
  TRACK_SECTION_OVERLAP: "blocking",
  TRACK_CLEARANCE_TOO_SHORT: "blocking",
  TRACK_CLOSED: "blocking",
  LAYOUT_CAPACITY_EXCEEDED: "blocking",
  CATEGORY_NOT_ALLOWED: "blocking",
  MIXED_CATEGORIES: "blocking",
  VEHICLE_DOUBLE_BOOKED: "blocking",
  VEHICLE_UNAVAILABLE: "blocking",
  VEHICLE_TURNAROUND_TOO_SHORT: "blocking",
  PIT_BOX_DOUBLE_BOOKED: "blocking",
  PIT_BOX_CAPACITY_EXCEEDED: "blocking",
  NO_VEHICLES_ASSIGNED: "warning",
};

const CODE_ORDER = new Map<ConflictCode, number>(
  CONFLICT_CODES.map((code, index) => [code, index]),
);

/** Locale-independent code-unit comparison. Never use localeCompare in the engine. */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareResources(a: ResourceRef, b: ResourceRef): number {
  return compareStrings(a.kind, b.kind) || compareStrings(a.id, b.id);
}

export function makeConflict(
  code: ConflictCode,
  sessionIds: readonly string[],
  resources: readonly ResourceRef[],
  params: Readonly<Record<string, number | string>> = {},
): Conflict {
  const sortedSessions = [...sessionIds].sort(compareStrings);
  const sortedResources = [...resources].sort(compareResources);
  const paramText = Object.keys(params)
    .sort(compareStrings)
    .map((name) => `${name}=${params[name]}`)
    .join(",");
  const key = [
    code,
    sortedSessions.join(","),
    sortedResources.map((r) => `${r.kind}:${r.id}`).join(","),
    paramText,
  ].join("|");
  return {
    code,
    severity: SEVERITY[code],
    sessionIds: sortedSessions,
    resources: sortedResources,
    params,
    key,
  };
}

/** Total order: blocking before warning, then code order, then canonical key. */
export function compareConflicts(a: Conflict, b: Conflict): number {
  const severity = (a.severity === "blocking" ? 0 : 1) - (b.severity === "blocking" ? 0 : 1);
  if (severity !== 0) return severity;
  const code = (CODE_ORDER.get(a.code) ?? 0) - (CODE_ORDER.get(b.code) ?? 0);
  if (code !== 0) return code;
  return compareStrings(a.key, b.key);
}
