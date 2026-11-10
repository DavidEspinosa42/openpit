import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkDayReferences,
  createRandom,
  generateDay,
  type ScheduleDay,
  type Workspace,
} from "../../src/domain/index.ts";
import { validateDay } from "../../src/engine/index.ts";

const workspace = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "..", "..", "data", "samples", "fictional-ridge.json"),
    "utf8",
  ),
) as Workspace;
const config = workspace.config;

function shuffle<T>(items: readonly T[], seed: number): T[] {
  const random = createRandom(seed);
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

function shuffled(day: ScheduleDay, seed: number): ScheduleDay {
  return {
    ...day,
    sessions: shuffle(day.sessions, seed).map((s) => ({
      ...s,
      vehicleIds: shuffle(s.vehicleIds, seed + 1),
      pitBoxIds: shuffle(s.pitBoxIds, seed + 2),
    })),
    closures: shuffle(day.closures, seed + 3),
    unavailabilities: shuffle(day.unavailabilities, seed + 4),
  };
}

describe("determinism", () => {
  it("generated days are structurally valid", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const day = generateDay(config, { seed, date: "2026-06-13", sessionCount: 40 });
      expect(checkDayReferences(config, day)).toEqual([]);
    }
  });

  it("generation is deterministic for a seed", () => {
    const a = generateDay(config, { seed: 7, date: "2026-06-13", sessionCount: 30 });
    const b = generateDay(config, { seed: 7, date: "2026-06-13", sessionCount: 30 });
    expect(a).toEqual(b);
  });

  it("returns identical output for permuted inputs", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const day = generateDay(config, { seed, date: "2026-06-13", sessionCount: 60 });
      const baseline = validateDay(config, day);
      expect(baseline.length).toBeGreaterThan(0);
      for (let k = 0; k < 3; k++) {
        expect(validateDay(config, shuffled(day, seed * 10 + k))).toEqual(baseline);
      }
    }
  });

  it("does not mutate its inputs", () => {
    const day = generateDay(config, { seed: 3, date: "2026-06-13", sessionCount: 30 });
    const before = structuredClone(day);
    validateDay(config, day);
    expect(day).toEqual(before);
  });

  it("returns conflicts in a strict total order with unique keys", () => {
    const day = generateDay(config, { seed: 11, date: "2026-06-13", sessionCount: 80 });
    const result = validateDay(config, day);
    expect(new Set(result.map((c) => c.key)).size).toBe(result.length);
    const firstWarning = result.findIndex((c) => c.severity === "warning");
    if (firstWarning >= 0) {
      expect(result.slice(firstWarning).every((c) => c.severity === "warning")).toBe(true);
    }
  });
});

describe("performance", () => {
  /** Documented budget: a 200-session day validates in under 250 ms on a development machine. */
  const BUDGET_MS = 250;

  it(`validates a 200-session day within ${BUDGET_MS} ms`, () => {
    const day = generateDay(config, { seed: 42, date: "2026-06-13", sessionCount: 200 });
    validateDay(config, day); // warm up
    const runs: number[] = [];
    for (let i = 0; i < 5; i++) {
      const started = performance.now();
      validateDay(config, day);
      runs.push(performance.now() - started);
    }
    expect(Math.min(...runs)).toBeLessThan(BUDGET_MS);
  });
});
