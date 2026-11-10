import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateDay, type Workspace } from "../../src/domain/index.ts";
import { suggestSlots, validateDay } from "../../src/engine/index.ts";
import { config, makeDay, ses } from "./fixtures.ts";

const sample = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "..", "..", "data", "samples", "fictional-ridge.json"),
    "utf8",
  ),
) as Workspace;

const blockingKeysNotInvolving = (conflicts: ReturnType<typeof validateDay>, id: string) =>
  conflicts
    .filter((c) => c.severity === "blocking" && !c.sessionIds.includes(id))
    .map((c) => c.key);

describe("suggestSlots", () => {
  it("proposes the nearest conflict-free starts, nearest first", () => {
    const day = makeDay([
      ses("a", 540, 600, { vehicles: ["car1"] }),
      ses("b", 570, 630, { vehicles: ["car2"] }), // overlaps a on shared sections
    ]);
    const result = suggestSlots(config, day, "b", { limit: 3 });
    // Earlier starts would end less than 10 minutes before a, or open before 08:00; so only later ones work.
    expect(result.map((s) => s.startMinute)).toEqual([610, 615, 620]);
    expect(result[0]).toEqual({
      sessionId: "b",
      startMinute: 610,
      endMinute: 670,
      shiftMinutes: 40,
    });
  });

  it("keeps the duration and stays on the grid", () => {
    const day = makeDay([ses("a", 540, 600), ses("b", 570, 645, { vehicles: ["car2"] })]);
    for (const s of suggestSlots(config, day, "b", { limit: 5 })) {
      expect(s.endMinute - s.startMinute).toBe(75);
      expect(s.startMinute % config.gridMinutes).toBe(0);
    }
  });

  it("never suggests the current start", () => {
    const day = makeDay([ses("a", 540, 600)]);
    const result = suggestSlots(config, day, "a", { limit: 5 });
    expect(result.every((s) => s.startMinute !== 540)).toBe(true);
    expect(result).toHaveLength(5);
  });

  it("respects the limit and returns an empty list for limit 0", () => {
    const day = makeDay([ses("a", 540, 600)]);
    expect(suggestSlots(config, day, "a", { limit: 2 })).toHaveLength(2);
    expect(suggestSlots(config, day, "a", { limit: 0 })).toEqual([]);
  });

  it("returns an empty list for unknown or cancelled sessions", () => {
    const day = makeDay([ses("a", 540, 600, { status: "cancelled" })]);
    expect(suggestSlots(config, day, "a")).toEqual([]);
    expect(suggestSlots(config, day, "nope")).toEqual([]);
  });

  it("says none exist when no start can work", () => {
    // The session fills the whole operating day, but the vehicle is in maintenance on every start.
    const day = makeDay([ses("a", 480, 1080, { vehicles: ["carm"] })]);
    expect(suggestSlots(config, day, "a", { limit: 5 })).toEqual([]);
  });

  it("says none exist when the only slot is closed", () => {
    const closure = {
      id: "cl",
      sectionId: "b",
      startMinute: 480,
      endMinute: 1080,
      reason: "closed",
    };
    const day = makeDay([ses("a", 540, 600)], { closures: [closure] });
    expect(suggestSlots(config, day, "a", { limit: 5 })).toEqual([]);
  });

  it("is deterministic", () => {
    const day = makeDay([ses("a", 540, 600), ses("b", 570, 630, { vehicles: ["car2"] })]);
    expect(suggestSlots(config, day, "b")).toEqual(suggestSlots(config, day, "b"));
  });

  it("does not mutate the day", () => {
    const day = makeDay([ses("a", 540, 600), ses("b", 570, 630, { vehicles: ["car2"] })]);
    const before = structuredClone(day);
    suggestSlots(config, day, "b");
    expect(day).toEqual(before);
  });
});

describe("soundness (invariant 5)", () => {
  it("applying any suggestion removes the session's blocking conflicts and adds none elsewhere", () => {
    let checked = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const day = generateDay(sample.config, { seed, date: "2026-06-13", sessionCount: 25 });
      const before = validateDay(sample.config, day);
      for (const session of day.sessions) {
        if (session.status === "cancelled") continue;
        for (const suggestion of suggestSlots(sample.config, day, session.id, { limit: 3 })) {
          const moved = {
            ...day,
            sessions: day.sessions.map((s) =>
              s.id === session.id
                ? { ...s, startMinute: suggestion.startMinute, endMinute: suggestion.endMinute }
                : s,
            ),
          };
          const after = validateDay(sample.config, moved);
          expect(
            after.filter((c) => c.severity === "blocking" && c.sessionIds.includes(session.id)),
          ).toEqual([]);
          expect(blockingKeysNotInvolving(after, session.id)).toEqual(
            blockingKeysNotInvolving(before, session.id),
          );
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("finds exactly the starts that a full validation accepts (nothing missed, nothing extra)", () => {
    const day = generateDay(sample.config, { seed: 5, date: "2026-06-13", sessionCount: 30 });
    const session = day.sessions.find((s) => s.status === "planned");
    if (!session) throw new Error("fixture");
    const duration = session.endMinute - session.startMinute;
    const expected: number[] = [];
    for (let start = 0; start + duration <= 1440; start += sample.config.gridMinutes) {
      if (start === session.startMinute) continue;
      const moved = {
        ...day,
        sessions: day.sessions.map((s) =>
          s.id === session.id ? { ...s, startMinute: start, endMinute: start + duration } : s,
        ),
      };
      const blocked = validateDay(sample.config, moved).some(
        (c) => c.severity === "blocking" && c.sessionIds.includes(session.id),
      );
      if (!blocked) expected.push(start);
    }
    expected.sort(
      (a, b) => Math.abs(a - session.startMinute) - Math.abs(b - session.startMinute) || a - b,
    );
    const actual = suggestSlots(sample.config, day, session.id, { limit: 1000 }).map(
      (s) => s.startMinute,
    );
    expect(actual).toEqual(expected);
  });

  /** Documented budget: one request on a 200-session day finishes in under 500 ms. */
  it("answers one request on a 200-session day within 500 ms", () => {
    const day = generateDay(sample.config, { seed: 42, date: "2026-06-13", sessionCount: 200 });
    const times: number[] = [];
    for (const session of day.sessions.slice(0, 8)) {
      const started = performance.now();
      suggestSlots(sample.config, day, session.id);
      times.push(performance.now() - started);
    }
    expect(Math.max(...times)).toBeLessThan(500);
  });
});
