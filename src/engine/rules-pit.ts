import { intervalsOverlap } from "../domain/time.ts";
import type { Conflict } from "../domain/types.ts";
import { makeConflict } from "./conflict.ts";
import { type Context, intersect } from "./context.ts";

/** Rules about pit boxes: exclusive use per session and combined vehicle capacity. */
export function pitRules(ctx: Context): Conflict[] {
  const out: Conflict[] = [];

  for (const session of ctx.sessions) {
    if (session.pitBoxIds.length === 0) continue;
    let capacity = 0;
    for (const id of session.pitBoxIds) capacity += ctx.pitBoxes.get(id)?.capacity ?? 0;
    if (session.vehicleIds.length > capacity) {
      out.push(
        makeConflict(
          "PIT_BOX_CAPACITY_EXCEEDED",
          [session.id],
          session.pitBoxIds.map((id) => ({ kind: "pitBox" as const, id })),
          { vehicles: session.vehicleIds.length, capacity },
        ),
      );
    }
  }

  for (let i = 0; i < ctx.sessions.length; i++) {
    const a = ctx.sessions[i];
    if (!a) continue;
    for (let j = i + 1; j < ctx.sessions.length; j++) {
      const b = ctx.sessions[j];
      if (!b || !intervalsOverlap(a, b)) continue;
      for (const pitBoxId of intersect(a.pitBoxIds, b.pitBoxIds)) {
        const overlapMinutes =
          Math.min(a.endMinute, b.endMinute) - Math.max(a.startMinute, b.startMinute);
        out.push(
          makeConflict("PIT_BOX_DOUBLE_BOOKED", [a.id, b.id], [{ kind: "pitBox", id: pitBoxId }], {
            overlapMinutes,
          }),
        );
      }
    }
  }

  return out;
}
