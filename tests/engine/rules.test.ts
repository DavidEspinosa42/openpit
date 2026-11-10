import { describe, expect, it } from "vitest";
import { validateDay } from "../../src/engine/index.ts";
import { codes, config, makeDay, only, ses } from "./fixtures.ts";

const validate = (...args: Parameters<typeof makeDay>) => validateDay(config, makeDay(...args));

describe("a clean day", () => {
  it("has no conflicts", () => {
    expect(validate([ses("s1", 540, 600)])).toEqual([]);
  });
});

describe("OUTSIDE_OPERATING_HOURS", () => {
  it("fires for a track session ending after closing", () => {
    const result = only(validate([ses("s1", 1040, 1085)]), "OUTSIDE_OPERATING_HOURS");
    expect(result).toHaveLength(1);
    expect(result[0]?.sessionIds).toEqual(["s1"]);
    expect(result[0]?.params).toEqual({ opensAt: 480, closesAt: 1080 });
  });
  it("fires for a track session starting before opening", () => {
    expect(codes(validate([ses("s1", 475, 540)]))).toContain("OUTSIDE_OPERATING_HOURS");
  });
  it("does not fire exactly on the boundaries", () => {
    expect(validate([ses("s1", 480, 1080)])).toEqual([]);
  });
  it("does not fire for off-track activities", () => {
    expect(validate([ses("s1", 420, 470, { activity: "prep" })])).toEqual([]);
  });
});

describe("TRACK_SECTION_OVERLAP", () => {
  it("fires when layouts share a section and times overlap", () => {
    const result = only(
      validate([
        ses("s1", 540, 600, { layout: "L1", vehicles: ["car1"] }),
        ses("s2", 570, 630, { layout: "L2", vehicles: ["car2"] }),
      ]),
      "TRACK_SECTION_OVERLAP",
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.sessionIds).toEqual(["s1", "s2"]);
    expect(result[0]?.resources).toEqual([{ kind: "section", id: "b" }]);
    expect(result[0]?.params).toEqual({ overlapMinutes: 30 });
  });
  it("does not fire for layouts without a shared section", () => {
    const result = validate([
      ses("s1", 540, 600, { layout: "L1", vehicles: ["car1"] }),
      ses("s2", 540, 600, { layout: "L3", vehicles: ["car2"] }),
    ]);
    expect(codes(result)).not.toContain("TRACK_SECTION_OVERLAP");
  });
  it("does not fire for touching intervals", () => {
    const result = validate([
      ses("s1", 540, 600, { vehicles: ["car1"] }),
      ses("s2", 600, 660, { vehicles: ["car2"] }),
    ]);
    expect(codes(result)).not.toContain("TRACK_SECTION_OVERLAP");
  });
  it("ignores cancelled sessions", () => {
    const result = validate([
      ses("s1", 540, 600, { vehicles: ["car1"] }),
      ses("s2", 540, 600, { vehicles: ["car2"], status: "cancelled" }),
    ]);
    expect(result).toEqual([]);
  });
});

describe("TRACK_CLEARANCE_TOO_SHORT", () => {
  it("fires when the gap is below the clearance", () => {
    const result = only(
      validate([
        ses("s1", 540, 600, { vehicles: ["car1"] }),
        ses("s2", 605, 660, { vehicles: ["car2"] }),
      ]),
      "TRACK_CLEARANCE_TOO_SHORT",
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.params).toEqual({ gap: 5, required: 10 });
  });
  it("fires for touching sessions on shared sections", () => {
    const result = validate([
      ses("s1", 540, 600, { vehicles: ["car1"] }),
      ses("s2", 600, 660, { vehicles: ["car2"] }),
    ]);
    expect(codes(result)).toEqual(["TRACK_CLEARANCE_TOO_SHORT"]);
  });
  it("does not fire when the gap equals the clearance", () => {
    const result = validate([
      ses("s1", 540, 600, { vehicles: ["car1"] }),
      ses("s2", 610, 660, { vehicles: ["car2"] }),
    ]);
    expect(result).toEqual([]);
  });
  it("does not fire for layouts without a shared section", () => {
    const result = validate([
      ses("s1", 540, 600, { layout: "L1", vehicles: ["car1"] }),
      ses("s2", 600, 660, { layout: "L3", vehicles: ["car2"] }),
    ]);
    expect(result).toEqual([]);
  });
  it("is disabled when clearanceMinutes is 0", () => {
    const loose = { ...config, circuit: { ...config.circuit, clearanceMinutes: 0 } };
    const day = makeDay([
      ses("s1", 540, 600, { vehicles: ["car1"] }),
      ses("s2", 600, 660, { vehicles: ["car2"] }),
    ]);
    expect(validateDay(loose, day)).toEqual([]);
  });
});

describe("TRACK_CLOSED", () => {
  const closure = { id: "cl1", sectionId: "b", startMinute: 600, endMinute: 660, reason: "repair" };
  it("fires when a session overlaps a closure of one of its sections", () => {
    const result = only(validate([ses("s1", 630, 690)], { closures: [closure] }), "TRACK_CLOSED");
    expect(result).toHaveLength(1);
    expect(result[0]?.resources).toEqual([
      { kind: "closure", id: "cl1" },
      { kind: "section", id: "b" },
    ]);
  });
  it("does not fire for a section the layout does not use", () => {
    expect(validate([ses("s1", 630, 690, { layout: "L3" })], { closures: [closure] })).toEqual([]);
  });
  it("does not fire when the session only touches the closure", () => {
    expect(validate([ses("s1", 660, 720)], { closures: [closure] })).toEqual([]);
    expect(validate([ses("s1", 540, 600)], { closures: [closure] })).toEqual([]);
  });
});

describe("LAYOUT_CAPACITY_EXCEEDED", () => {
  it("fires when a category exceeds the layout capacity", () => {
    const result = only(
      validate([ses("s1", 540, 600, { layout: "L3", vehicles: ["car1", "car2"] })]),
      "LAYOUT_CAPACITY_EXCEEDED",
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.params).toEqual({ count: 2, capacity: 1 });
  });
  it("does not fire at exactly the capacity", () => {
    expect(validate([ses("s1", 540, 600, { vehicles: ["car1", "car2", "car3"] })])).toEqual([]);
  });
  it("treats a missing category capacity as zero", () => {
    const result = validate([
      ses("s1", 540, 600, { layout: "L2", activity: "open", vehicles: ["kart1"] }),
    ]);
    expect(codes(result)).toEqual(["LAYOUT_CAPACITY_EXCEEDED"]);
  });
});

describe("CATEGORY_NOT_ALLOWED", () => {
  it("fires for a vehicle category the activity does not allow", () => {
    const result = only(
      validate([ses("s1", 540, 600, { vehicles: ["kart1"] })]),
      "CATEGORY_NOT_ALLOWED",
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.resources).toEqual([
      { kind: "category", id: "kart" },
      { kind: "vehicle", id: "kart1" },
    ]);
  });
  it("does not fire for an allowed category", () => {
    expect(
      codes(validate([ses("s1", 540, 600, { activity: "open", vehicles: ["kart1"] })])),
    ).not.toContain("CATEGORY_NOT_ALLOWED");
  });
});

describe("MIXED_CATEGORIES", () => {
  it("fires when mixing is not allowed and categories differ", () => {
    const result = validate([
      ses("s1", 540, 600, { activity: "open", vehicles: ["car1", "kart1"] }),
    ]);
    expect(codes(result)).not.toContain("MIXED_CATEGORIES"); // open allows mixing
    const strict = {
      ...config,
      activityTypes: config.activityTypes.map((a) =>
        a.id === "track" ? { ...a, allowedCategoryIds: ["car", "kart"] } : a,
      ),
    };
    const mixed = validateDay(
      strict,
      makeDay([ses("s1", 540, 600, { vehicles: ["car1", "kart1"] })]),
    );
    expect(only(mixed, "MIXED_CATEGORIES")).toHaveLength(1);
  });
  it("does not fire for a single category", () => {
    expect(validate([ses("s1", 540, 600, { vehicles: ["car1", "car2"] })])).toEqual([]);
  });
});

describe("VEHICLE_DOUBLE_BOOKED", () => {
  it("fires when a vehicle is in two overlapping sessions", () => {
    const result = only(
      validate([
        ses("s1", 540, 600, { layout: "L1", vehicles: ["car1"] }),
        ses("s2", 570, 630, { layout: "L3", vehicles: ["car1"] }),
      ]),
      "VEHICLE_DOUBLE_BOOKED",
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.sessionIds).toEqual(["s1", "s2"]);
  });
  it("does not fire for touching sessions", () => {
    const result = validate([
      ses("s1", 540, 600, { layout: "L1", vehicles: ["car1"] }),
      ses("s2", 600, 660, { layout: "L3", vehicles: ["car1"] }),
    ]);
    expect(codes(result)).not.toContain("VEHICLE_DOUBLE_BOOKED");
  });
  it("reports one conflict per shared vehicle", () => {
    const result = validate([
      ses("s1", 540, 600, { layout: "L1", vehicles: ["car1", "car2"] }),
      ses("s2", 540, 600, { layout: "L3", vehicles: ["car1", "car2"] }),
    ]);
    expect(only(result, "VEHICLE_DOUBLE_BOOKED")).toHaveLength(2);
  });
});

describe("VEHICLE_UNAVAILABLE", () => {
  it("fires for a vehicle that is not available on a track session", () => {
    const result = only(
      validate([ses("s1", 540, 600, { vehicles: ["carm"] })]),
      "VEHICLE_UNAVAILABLE",
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.params).toEqual({ cause: "status", status: "maintenance" });
  });
  it("allows preparing a vehicle in maintenance off-track", () => {
    expect(validate([ses("s1", 540, 600, { activity: "prep", vehicles: ["carm"] })])).toEqual([]);
  });
  it("fires when the session overlaps an unavailability window", () => {
    const window = {
      id: "u1",
      vehicleId: "car1",
      startMinute: 570,
      endMinute: 600,
      reason: "tires",
    };
    const result = only(
      validate([ses("s1", 540, 580)], { unavailabilities: [window] }),
      "VEHICLE_UNAVAILABLE",
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.params).toEqual({ cause: "window" });
  });
  it("does not fire when the session only touches the window", () => {
    const window = {
      id: "u1",
      vehicleId: "car1",
      startMinute: 600,
      endMinute: 630,
      reason: "tires",
    };
    expect(validate([ses("s1", 540, 600)], { unavailabilities: [window] })).toEqual([]);
  });
});

describe("VEHICLE_TURNAROUND_TOO_SHORT", () => {
  it("fires when the gap is below the category turnaround", () => {
    const result = only(
      validate([
        ses("s1", 540, 600, { layout: "L1", vehicles: ["car1"] }),
        ses("s2", 610, 660, { layout: "L3", vehicles: ["car1"] }),
      ]),
      "VEHICLE_TURNAROUND_TOO_SHORT",
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.params).toEqual({ gap: 10, required: 15 });
  });
  it("does not fire when the gap equals the turnaround", () => {
    const result = validate([
      ses("s1", 540, 600, { layout: "L1", vehicles: ["car1"] }),
      ses("s2", 615, 660, { layout: "L3", vehicles: ["car1"] }),
    ]);
    expect(codes(result)).not.toContain("VEHICLE_TURNAROUND_TOO_SHORT");
  });
});

describe("PIT_BOX_DOUBLE_BOOKED", () => {
  it("fires when overlapping sessions use the same pit box", () => {
    const result = only(
      validate([
        ses("s1", 540, 600, { layout: "L1", vehicles: ["car1"], pits: ["p1"] }),
        ses("s2", 570, 630, { layout: "L3", vehicles: ["car2"], pits: ["p1"] }),
      ]),
      "PIT_BOX_DOUBLE_BOOKED",
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.resources).toEqual([{ kind: "pitBox", id: "p1" }]);
  });
  it("does not fire for different pit boxes or touching times", () => {
    const result = validate([
      ses("s1", 540, 600, { layout: "L1", vehicles: ["car1"], pits: ["p1"] }),
      ses("s2", 540, 600, { layout: "L3", vehicles: ["car2"], pits: ["p2"] }),
      ses("s3", 600, 660, { layout: "L3", vehicles: ["car3"], pits: ["p1"] }),
    ]);
    expect(codes(result)).not.toContain("PIT_BOX_DOUBLE_BOOKED");
  });
});

describe("PIT_BOX_CAPACITY_EXCEEDED", () => {
  it("fires when vehicles exceed the combined pit box capacity", () => {
    const result = only(
      validate([ses("s1", 540, 600, { vehicles: ["car1", "car2", "car3"], pits: ["p1"] })]),
      "PIT_BOX_CAPACITY_EXCEEDED",
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.params).toEqual({ vehicles: 3, capacity: 2 });
  });
  it("sums several pit boxes and ignores sessions without pit boxes", () => {
    expect(
      validate([ses("s1", 540, 600, { vehicles: ["car1", "car2", "car3"], pits: ["p1", "p2"] })]),
    ).toEqual([]);
    expect(validate([ses("s1", 540, 600, { vehicles: ["car1", "car2", "car3"] })])).toEqual([]);
  });
});

describe("NO_VEHICLES_ASSIGNED", () => {
  it("is a warning for a session whose activity needs vehicles", () => {
    const result = validate([ses("s1", 540, 600, { vehicles: [] })]);
    expect(result).toHaveLength(1);
    expect(result[0]?.code).toBe("NO_VEHICLES_ASSIGNED");
    expect(result[0]?.severity).toBe("warning");
  });
  it("does not fire for an activity that allows no vehicles", () => {
    expect(validate([ses("s1", 420, 470, { activity: "brief", vehicles: [] })])).toEqual([]);
  });
});

describe("ordering and reporting", () => {
  it("lists blocking conflicts before warnings", () => {
    const result = validate([
      ses("s1", 540, 600, { vehicles: [] }),
      ses("s2", 540, 600, { vehicles: ["carm"] }),
    ]);
    expect(result.map((c) => c.severity)).toEqual(["blocking", "blocking", "warning"]);
  });
  it("reports each conflict once", () => {
    const result = validate([
      ses("s1", 540, 600, { vehicles: ["car1"] }),
      ses("s2", 570, 630, { vehicles: ["car2"] }),
    ]);
    const keys = result.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("does not throw for dangling references", () => {
    const broken = ses("s1", 540, 600, { vehicles: ["ghost"], layout: "nope" });
    expect(() => validate([broken])).not.toThrow();
  });
});
