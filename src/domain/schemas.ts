import { z } from "zod";
import { isValidDateString, MINUTES_PER_DAY } from "./time.ts";

/**
 * Zod schemas for the workspace file and the data held in storage.
 * All objects are strict: unknown keys are rejected, which also keeps person fields out (invariant 6).
 */

export const FORMAT_VERSION = 1;
export const MAX_DAYS = 400;
export const MAX_SESSIONS_PER_DAY = 2000;

export const IdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/, "invalid id");
export const NameSchema = z.string().trim().min(1).max(80);
export const LabelSchema = z.string().trim().max(80);
export const MinuteSchema = z.number().int().min(0).max(MINUTES_PER_DAY);
export const DateSchema = z
  .string()
  .refine(isValidDateString, "expected a calendar date YYYY-MM-DD");

const intervalShape = { startMinute: MinuteSchema, endMinute: MinuteSchema };

function endsAfterStart(value: { startMinute: number; endMinute: number }): boolean {
  return value.startMinute < value.endMinute;
}

const END_AFTER_START = {
  message: "endMinute must be greater than startMinute",
  path: ["endMinute"],
};

export const VehicleStatusSchema = z.enum(["available", "maintenance", "retired"]);
export const SessionStatusSchema = z.enum(["planned", "cancelled"]);

export const TrackSectionSchema = z.strictObject({ id: IdSchema, name: NameSchema });

export const TrackLayoutSchema = z.strictObject({
  id: IdSchema,
  name: NameSchema,
  sectionIds: z.array(IdSchema).min(1).max(100),
  /** Maximum vehicles on track at once, per vehicle category. A missing category means 0. */
  capacity: z.record(IdSchema, z.number().int().min(0).max(1000)),
});

export const OperatingHoursSchema = z
  .strictObject({ ...intervalShape })
  .refine(endsAfterStart, END_AFTER_START);

export const CircuitSchema = z.strictObject({
  id: IdSchema,
  name: NameSchema,
  sections: z.array(TrackSectionSchema).min(1).max(100),
  layouts: z.array(TrackLayoutSchema).min(1).max(50),
  operatingHours: OperatingHoursSchema,
  /** Minimum minutes between two track sessions that share a section. 0 disables the rule. */
  clearanceMinutes: z.number().int().min(0).max(240),
});

export const VehicleCategorySchema = z.strictObject({
  id: IdSchema,
  name: NameSchema,
  /** Minimum minutes between two sessions of the same vehicle. */
  turnaroundMinutes: z.number().int().min(0).max(720),
});

export const VehicleSchema = z.strictObject({
  id: IdSchema,
  name: NameSchema,
  categoryId: IdSchema,
  status: VehicleStatusSchema,
});

export const ActivityTypeSchema = z.strictObject({
  id: IdSchema,
  name: NameSchema,
  usesTrack: z.boolean(),
  allowedCategoryIds: z.array(IdSchema).max(100),
  mixingAllowed: z.boolean(),
});

export const PitBoxSchema = z.strictObject({
  id: IdSchema,
  name: NameSchema,
  capacity: z.number().int().min(1).max(50),
});

export const SchoolConfigSchema = z
  .strictObject({
    name: NameSchema,
    gridMinutes: z.number().int().min(1).max(60),
    circuit: CircuitSchema,
    categories: z.array(VehicleCategorySchema).min(1).max(100),
    vehicles: z.array(VehicleSchema).max(1000),
    activityTypes: z.array(ActivityTypeSchema).min(1).max(100),
    pitBoxes: z.array(PitBoxSchema).max(200),
  })
  .refine((c) => MINUTES_PER_DAY % c.gridMinutes === 0, {
    message: "gridMinutes must divide 1440",
    path: ["gridMinutes"],
  });

export const SessionSchema = z
  .strictObject({
    ...intervalShape,
    id: IdSchema,
    /** Free-text label only. No person fields exist by design. */
    label: LabelSchema,
    activityTypeId: IdSchema,
    /** Required for track activities, null for off-track activities. */
    layoutId: IdSchema.nullable(),
    vehicleIds: z.array(IdSchema).max(500),
    pitBoxIds: z.array(IdSchema).max(50),
    status: SessionStatusSchema,
  })
  .refine(endsAfterStart, END_AFTER_START);

export const TrackClosureSchema = z
  .strictObject({
    ...intervalShape,
    id: IdSchema,
    sectionId: IdSchema,
    reason: LabelSchema,
  })
  .refine(endsAfterStart, END_AFTER_START);

export const VehicleUnavailabilitySchema = z
  .strictObject({
    ...intervalShape,
    id: IdSchema,
    vehicleId: IdSchema,
    reason: LabelSchema,
  })
  .refine(endsAfterStart, END_AFTER_START);

export const ScheduleDaySchema = z.strictObject({
  date: DateSchema,
  revision: z.number().int().min(0),
  sessions: z.array(SessionSchema).max(MAX_SESSIONS_PER_DAY),
  closures: z.array(TrackClosureSchema).max(500),
  unavailabilities: z.array(VehicleUnavailabilitySchema).max(2000),
});

export const WorkspaceSchema = z.strictObject({
  formatVersion: z.literal(FORMAT_VERSION),
  config: SchoolConfigSchema,
  days: z.array(ScheduleDaySchema).max(MAX_DAYS),
});
