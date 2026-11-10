import type { z } from "zod";
import type {
  ActivityTypeSchema,
  CircuitSchema,
  PitBoxSchema,
  ScheduleDaySchema,
  SchoolConfigSchema,
  SessionSchema,
  TrackClosureSchema,
  TrackLayoutSchema,
  TrackSectionSchema,
  VehicleCategorySchema,
  VehicleSchema,
  VehicleStatusSchema,
  VehicleUnavailabilitySchema,
  WorkspaceSchema,
} from "./schemas.ts";

export type TrackSection = z.infer<typeof TrackSectionSchema>;
export type TrackLayout = z.infer<typeof TrackLayoutSchema>;
export type Circuit = z.infer<typeof CircuitSchema>;
export type VehicleCategory = z.infer<typeof VehicleCategorySchema>;
export type VehicleStatus = z.infer<typeof VehicleStatusSchema>;
export type Vehicle = z.infer<typeof VehicleSchema>;
export type ActivityType = z.infer<typeof ActivityTypeSchema>;
export type PitBox = z.infer<typeof PitBoxSchema>;
export type SchoolConfig = z.infer<typeof SchoolConfigSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type TrackClosure = z.infer<typeof TrackClosureSchema>;
export type VehicleUnavailability = z.infer<typeof VehicleUnavailabilitySchema>;
export type ScheduleDay = z.infer<typeof ScheduleDaySchema>;
export type Workspace = z.infer<typeof WorkspaceSchema>;

export type Severity = "blocking" | "warning";

export const CONFLICT_CODES = [
  "OUTSIDE_OPERATING_HOURS",
  "TRACK_SECTION_OVERLAP",
  "TRACK_CLEARANCE_TOO_SHORT",
  "TRACK_CLOSED",
  "LAYOUT_CAPACITY_EXCEEDED",
  "CATEGORY_NOT_ALLOWED",
  "MIXED_CATEGORIES",
  "VEHICLE_DOUBLE_BOOKED",
  "VEHICLE_UNAVAILABLE",
  "VEHICLE_TURNAROUND_TOO_SHORT",
  "PIT_BOX_DOUBLE_BOOKED",
  "PIT_BOX_CAPACITY_EXCEEDED",
  "NO_VEHICLES_ASSIGNED",
] as const;

export type ConflictCode = (typeof CONFLICT_CODES)[number];

export type ResourceKind =
  | "section"
  | "layout"
  | "vehicle"
  | "pitBox"
  | "category"
  | "closure"
  | "unavailability";

export interface ResourceRef {
  readonly kind: ResourceKind;
  readonly id: string;
}

/** A rule violation. The engine returns codes and parameters; the UI and CLI format text. */
export interface Conflict {
  readonly code: ConflictCode;
  readonly severity: Severity;
  /** Sorted session IDs involved. */
  readonly sessionIds: readonly string[];
  /** Sorted resources involved. */
  readonly resources: readonly ResourceRef[];
  /** Rule-specific numbers and strings, for example `gap` and `required`. Keys are stable per code. */
  readonly params: Readonly<Record<string, number | string>>;
  /** Canonical unique key; defines the total order within a code. */
  readonly key: string;
}

export interface Suggestion {
  readonly sessionId: string;
  readonly startMinute: number;
  readonly endMinute: number;
  /** Signed shift from the current start, in minutes. */
  readonly shiftMinutes: number;
}
