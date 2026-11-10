import { gapBetween, intervalContains, intervalsOverlap } from "../domain/time.ts";
import type { Conflict } from "../domain/types.ts";
import { makeConflict } from "./conflict.ts";
import { type Context, sharedSections, trackLayoutOf } from "./context.ts";

/** Rules about the track: operating hours, section overlap, clearance, closures, capacity. */
export function trackRules(ctx: Context): Conflict[] {
  const out: Conflict[] = [];
  const hours = ctx.config.circuit.operatingHours;
  const clearance = ctx.config.circuit.clearanceMinutes;
  const trackSessions = ctx.sessions.filter((s) => trackLayoutOf(ctx, s) !== undefined);

  for (const session of trackSessions) {
    const layout = trackLayoutOf(ctx, session);
    if (!layout) continue;

    if (!intervalContains(hours, session)) {
      out.push(
        makeConflict("OUTSIDE_OPERATING_HOURS", [session.id], [], {
          opensAt: hours.startMinute,
          closesAt: hours.endMinute,
        }),
      );
    }

    for (const closure of ctx.closures) {
      if (layout.sectionIds.includes(closure.sectionId) && intervalsOverlap(session, closure)) {
        out.push(
          makeConflict(
            "TRACK_CLOSED",
            [session.id],
            [
              { kind: "section", id: closure.sectionId },
              { kind: "closure", id: closure.id },
            ],
            {},
          ),
        );
      }
    }

    const perCategory = new Map<string, number>();
    for (const vehicleId of session.vehicleIds) {
      const vehicle = ctx.vehicles.get(vehicleId);
      if (vehicle)
        perCategory.set(vehicle.categoryId, (perCategory.get(vehicle.categoryId) ?? 0) + 1);
    }
    for (const [categoryId, count] of perCategory) {
      const capacity = layout.capacity[categoryId] ?? 0;
      if (count > capacity) {
        out.push(
          makeConflict(
            "LAYOUT_CAPACITY_EXCEEDED",
            [session.id],
            [
              { kind: "layout", id: layout.id },
              { kind: "category", id: categoryId },
            ],
            { count, capacity },
          ),
        );
      }
    }
  }

  for (let i = 0; i < trackSessions.length; i++) {
    const a = trackSessions[i];
    const layoutA = a && trackLayoutOf(ctx, a);
    if (!a || !layoutA) continue;
    for (let j = i + 1; j < trackSessions.length; j++) {
      const b = trackSessions[j];
      const layoutB = b && trackLayoutOf(ctx, b);
      if (!b || !layoutB) continue;
      const shared = sharedSections(layoutA, layoutB);
      if (shared.length === 0) continue;
      const resources = shared.map((id) => ({ kind: "section" as const, id }));
      if (intervalsOverlap(a, b)) {
        const overlapMinutes =
          Math.min(a.endMinute, b.endMinute) - Math.max(a.startMinute, b.startMinute);
        out.push(
          makeConflict("TRACK_SECTION_OVERLAP", [a.id, b.id], resources, { overlapMinutes }),
        );
      } else if (clearance > 0) {
        const gap = gapBetween(a, b);
        if (gap < clearance) {
          out.push(
            makeConflict("TRACK_CLEARANCE_TOO_SHORT", [a.id, b.id], resources, {
              gap,
              required: clearance,
            }),
          );
        }
      }
    }
  }

  return out;
}
