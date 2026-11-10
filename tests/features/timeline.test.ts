import { describe, expect, it } from "vitest";
import { validateDay } from "../../src/engine/index.ts";
import {
  axisRange,
  buildScheduleRows,
  buildTimeline,
  conflictCounts,
  OFF_TRACK_LANE_ID,
  packRows,
  toPercent,
} from "../../src/features/timeline.ts";
import { config, makeDay, ses } from "../engine/fixtures.ts";

describe("axisRange", () => {
  it("adds an hour of margin around the operating hours", () => {
    expect(axisRange(config, makeDay([]))).toEqual({ startMinute: 420, endMinute: 1140 });
  });
  it("widens to include sessions outside the hours and stays inside the day", () => {
    const day = makeDay([
      ses("early", 30, 90, { activity: "prep" }),
      ses("late", 1400, 1440, { activity: "prep" }),
    ]);
    expect(axisRange(config, day)).toEqual({ startMinute: 0, endMinute: 1440 });
  });
});

describe("toPercent", () => {
  it("maps minutes onto the axis", () => {
    const axis = { startMinute: 420, endMinute: 1140 };
    expect(toPercent(420, axis)).toBe(0);
    expect(toPercent(1140, axis)).toBe(100);
    expect(toPercent(780, axis)).toBe(50);
  });
});

describe("packRows", () => {
  it("puts overlapping blocks on different rows and reuses rows for touching blocks", () => {
    const rows = packRows([
      { id: "a", startMinute: 0, endMinute: 60 },
      { id: "b", startMinute: 30, endMinute: 90 },
      { id: "c", startMinute: 60, endMinute: 120 },
      { id: "d", startMinute: 90, endMinute: 150 },
    ]);
    expect(rows.get("a")).toBe(0);
    expect(rows.get("b")).toBe(1);
    expect(rows.get("c")).toBe(0);
    expect(rows.get("d")).toBe(1);
  });
  it("does not depend on input order", () => {
    const blocks = [
      { id: "a", startMinute: 0, endMinute: 60 },
      { id: "b", startMinute: 0, endMinute: 60 },
      { id: "c", startMinute: 30, endMinute: 90 },
    ];
    expect([...packRows(blocks)]).toEqual(
      [...packRows([...blocks].reverse())].sort((x, y) => (x[0] < y[0] ? -1 : 1)),
    );
  });
});

describe("buildTimeline", () => {
  const day = makeDay(
    [
      ses("a", 540, 600, { layout: "L1", vehicles: ["car1"] }),
      ses("b", 570, 630, { layout: "L1", vehicles: ["car2"] }),
      ses("c", 700, 760, { layout: "L3", vehicles: [] }),
      ses("p", 450, 500, { activity: "prep", vehicles: ["car3"] }),
      ses("x", 540, 600, { layout: "L2", vehicles: ["car4"], status: "cancelled" }),
    ],
    { closures: [{ id: "cl", sectionId: "c", startMinute: 800, endMinute: 860, reason: "oil" }] },
  );
  const timeline = buildTimeline(config, day, validateDay(config, day));

  it("has one lane per layout plus an off-track lane that has sessions", () => {
    expect(timeline.lanes.map((l) => l.id)).toEqual(["L1", "L2", "L3", OFF_TRACK_LANE_ID]);
  });

  it("stacks overlapping sessions in a lane", () => {
    const l1 = timeline.lanes.find((l) => l.id === "L1");
    expect(l1?.rows).toBe(2);
    expect(l1?.items.map((i) => [i.id, i.row])).toEqual([
      ["a", 0],
      ["b", 1],
    ]);
  });

  it("counts conflicts per session and ignores them for cancelled sessions", () => {
    const l1 = timeline.lanes.find((l) => l.id === "L1");
    const a = l1?.items.find((i) => i.id === "a");
    expect(a?.blocking).toBeGreaterThan(0);
    expect(a?.description).toContain("blocking conflict");
    const x = timeline.lanes.find((l) => l.id === "L2")?.items[0];
    expect(x).toMatchObject({ cancelled: true, blocking: 0, warnings: 0 });
    expect(x?.description).toContain("cancelled");
  });

  it("describes a clean session as having no conflicts", () => {
    const clean = makeDay([ses("a", 540, 600)]);
    const t = buildTimeline(config, clean, validateDay(config, clean));
    expect(t.lanes[0]?.items[0]?.description).toBe("a, Track, 09:00-10:00, no conflicts");
  });

  it("places closures in the lanes that use the closed section", () => {
    const ids = timeline.lanes.filter((l) => l.closures.length > 0).map((l) => l.id);
    expect(ids).toEqual(["L2", "L3"]);
    expect(timeline.lanes.find((l) => l.id === "L3")?.closures[0]?.label).toBe(
      "Closed: Section C (oil)",
    );
  });

  it("hides the off-track lane when it is empty and always shows layout lanes", () => {
    const t = buildTimeline(config, makeDay([]), []);
    expect(t.lanes.map((l) => l.id)).toEqual(["L1", "L2", "L3"]);
  });

  it("labels the hour ticks", () => {
    expect(timeline.ticks[0]).toEqual({ minute: 420, left: 0, label: "07:00" });
  });
});

describe("conflictCounts and schedule rows", () => {
  const day = makeDay([
    ses("a", 540, 600, { vehicles: ["car1"] }),
    ses("b", 570, 630, { vehicles: [] }),
  ]);
  const conflicts = validateDay(config, day);

  it("counts by severity", () => {
    expect(conflictCounts(conflicts)).toEqual({ blocking: 1, warning: 1 });
  });

  it("lists sessions in time order with readable conflict messages", () => {
    const rows = buildScheduleRows(config, day, conflicts);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(rows[0]?.vehicles).toBe("Car 1");
    expect(rows[0]?.messages[0]).toContain("Blocking:");
    expect(rows[1]?.messages.some((m) => m.startsWith("Warning:"))).toBe(true);
  });
});
