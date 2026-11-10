import { gapBetween, intervalsOverlap } from "../domain/time.ts";
import type { Conflict } from "../domain/types.ts";
import { compareStrings, makeConflict } from "./conflict.ts";
import { type Context, intersect, trackLayoutOf } from "./context.ts";

/** Rules about vehicles: category fit, availability, double booking, turnaround, presence. */
export function vehicleRules(ctx: Context): Conflict[] {
  const out: Conflict[] = [];

  for (const session of ctx.sessions) {
    const activity = ctx.activities.get(session.activityTypeId);
    const onTrack = trackLayoutOf(ctx, session) !== undefined;

    if (activity) {
      const allowed = new Set(activity.allowedCategoryIds);
      const usedCategories = new Set<string>();
      for (const vehicleId of session.vehicleIds) {
        const vehicle = ctx.vehicles.get(vehicleId);
        if (!vehicle) continue;
        usedCategories.add(vehicle.categoryId);
        if (!allowed.has(vehicle.categoryId)) {
          out.push(
            makeConflict(
              "CATEGORY_NOT_ALLOWED",
              [session.id],
              [
                { kind: "vehicle", id: vehicle.id },
                { kind: "category", id: vehicle.categoryId },
              ],
              {},
            ),
          );
        }
      }
      if (!activity.mixingAllowed && usedCategories.size > 1) {
        out.push(
          makeConflict(
            "MIXED_CATEGORIES",
            [session.id],
            [...usedCategories]
              .sort(compareStrings)
              .map((id) => ({ kind: "category" as const, id })),
            { categories: usedCategories.size },
          ),
        );
      }
      if (activity.allowedCategoryIds.length > 0 && session.vehicleIds.length === 0) {
        out.push(makeConflict("NO_VEHICLES_ASSIGNED", [session.id], [], {}));
      }
    }

    for (const vehicleId of session.vehicleIds) {
      const vehicle = ctx.vehicles.get(vehicleId);
      if (!vehicle) continue;
      if (onTrack && vehicle.status !== "available") {
        out.push(
          makeConflict("VEHICLE_UNAVAILABLE", [session.id], [{ kind: "vehicle", id: vehicle.id }], {
            cause: "status",
            status: vehicle.status,
          }),
        );
      }
      for (const window of ctx.unavailabilities) {
        if (window.vehicleId === vehicleId && intervalsOverlap(session, window)) {
          out.push(
            makeConflict(
              "VEHICLE_UNAVAILABLE",
              [session.id],
              [
                { kind: "vehicle", id: vehicle.id },
                { kind: "unavailability", id: window.id },
              ],
              { cause: "window" },
            ),
          );
        }
      }
    }
  }

  for (let i = 0; i < ctx.sessions.length; i++) {
    const a = ctx.sessions[i];
    if (!a) continue;
    for (let j = i + 1; j < ctx.sessions.length; j++) {
      const b = ctx.sessions[j];
      if (!b) continue;
      const shared = intersect(a.vehicleIds, b.vehicleIds);
      if (shared.length === 0) continue;
      const overlaps = intervalsOverlap(a, b);
      const gap = gapBetween(a, b);
      for (const vehicleId of shared) {
        const resource = [{ kind: "vehicle" as const, id: vehicleId }];
        if (overlaps) {
          const overlapMinutes =
            Math.min(a.endMinute, b.endMinute) - Math.max(a.startMinute, b.startMinute);
          out.push(
            makeConflict("VEHICLE_DOUBLE_BOOKED", [a.id, b.id], resource, { overlapMinutes }),
          );
          continue;
        }
        const vehicle = ctx.vehicles.get(vehicleId);
        const category = vehicle && ctx.categories.get(vehicle.categoryId);
        if (category && gap < category.turnaroundMinutes) {
          out.push(
            makeConflict("VEHICLE_TURNAROUND_TOO_SHORT", [a.id, b.id], resource, {
              gap,
              required: category.turnaroundMinutes,
            }),
          );
        }
      }
    }
  }

  return out;
}
