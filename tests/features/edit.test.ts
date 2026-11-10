import { describe, expect, it } from "vitest";
import {
  addClosure,
  addUnavailability,
  draftFromSession,
  emptyDay,
  newDraft,
  nextId,
  removeClosure,
  removeSession,
  removeUnavailability,
  setSessionStatus,
  upsertSession,
  validateDraft,
  validateWindow,
  withActivity,
} from "../../src/features/edit.ts";
import { config, makeDay, ses } from "../engine/fixtures.ts";

describe("nextId", () => {
  it("picks the smallest unused number", () => {
    expect(nextId("session", [])).toBe("session-1");
    expect(nextId("session", ["session-1", "session-3"])).toBe("session-2");
  });
});

describe("day edits", () => {
  const day = makeDay([ses("a", 540, 600), ses("b", 600, 660)]);

  it("upserts without mutating the input", () => {
    const before = structuredClone(day);
    const replaced = upsertSession(day, { ...ses("a", 540, 600), label: "renamed" });
    const added = upsertSession(day, ses("c", 700, 760));
    expect(replaced.sessions.find((s) => s.id === "a")?.label).toBe("renamed");
    expect(replaced.sessions).toHaveLength(2);
    expect(added.sessions).toHaveLength(3);
    expect(day).toEqual(before);
  });

  it("removes, cancels and restores a session", () => {
    expect(removeSession(day, "a").sessions.map((s) => s.id)).toEqual(["b"]);
    const cancelled = setSessionStatus(day, "a", "cancelled");
    expect(cancelled.sessions.find((s) => s.id === "a")?.status).toBe("cancelled");
    expect(setSessionStatus(cancelled, "a", "planned").sessions[0]?.status).toBe("planned");
  });

  it("adds and removes closures and unavailability windows", () => {
    const closure = { id: "c1", sectionId: "a", startMinute: 600, endMinute: 660, reason: "" };
    const window = { id: "u1", vehicleId: "car1", startMinute: 600, endMinute: 660, reason: "" };
    expect(addClosure(day, closure).closures).toEqual([closure]);
    expect(removeClosure(addClosure(day, closure), "c1").closures).toEqual([]);
    expect(addUnavailability(day, window).unavailabilities).toEqual([window]);
    expect(removeUnavailability(addUnavailability(day, window), "u1").unavailabilities).toEqual([]);
  });

  it("creates an empty day at revision 0", () => {
    expect(emptyDay("2026-06-13")).toEqual({
      date: "2026-06-13",
      revision: 0,
      sessions: [],
      closures: [],
      unavailabilities: [],
    });
  });
});

describe("session form", () => {
  it("starts a new draft inside the operating hours with a fresh id", () => {
    const draft = newDraft(config, makeDay([ses("session-1", 540, 600)]));
    expect(draft.id).toBe("session-2");
    expect(draft.start).toBe("08:00");
    expect(draft.end).toBe("09:00");
    expect(draft.layoutId).toBe("L1");
    expect(validateDraft(config, draft).ok).toBe(true);
  });

  it("round-trips an existing session through a draft", () => {
    const session = {
      ...ses("s1", 545, 610, { vehicles: ["car1"], pits: ["p1"] }),
      label: "Warm-up",
    };
    const result = validateDraft(config, draftFromSession(session));
    expect(result).toEqual({ ok: true, session });
  });

  it("drops the layout for off-track activities and restores one for track activities", () => {
    const draft = newDraft(config, makeDay([]));
    const off = withActivity(config, draft, "prep");
    expect(off.layoutId).toBe("");
    const result = validateDraft(config, off);
    expect(result.ok && result.session.layoutId).toBe(null);
    expect(withActivity(config, off, "track").layoutId).toBe("L1");
  });

  it("reports errors per field", () => {
    const base = newDraft(config, makeDay([]));
    const bad = validateDraft(config, { ...base, start: "9am", end: "09:03", layoutId: "" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors.start).toContain("HH:MM");
      expect(bad.errors.end).toContain("multiple of 5");
      expect(bad.errors.layoutId).toContain("layout");
    }
  });

  it("rejects an end that is not after the start", () => {
    const base = newDraft(config, makeDay([]));
    for (const end of ["08:00", "07:00"]) {
      const result = validateDraft(config, { ...base, end });
      expect(!result.ok && result.errors.end).toContain("after the start");
    }
  });

  it("accepts a session that ends at midnight and rejects over-long labels", () => {
    const base = newDraft(config, makeDay([]));
    expect(validateDraft(config, { ...base, start: "23:00", end: "24:00" }).ok).toBe(true);
    const long = validateDraft(config, { ...base, label: "x".repeat(81) });
    expect(!long.ok && long.errors.label).toBeTruthy();
  });

  it("accepts conflicting values: conflicts are the engine's job, not the form's", () => {
    const base = newDraft(config, makeDay([]));
    expect(validateDraft(config, { ...base, start: "03:00", end: "04:00" }).ok).toBe(true);
  });
});

describe("window form", () => {
  it("validates target, times and reason", () => {
    const ok = validateWindow(config, {
      targetId: "b",
      start: "10:00",
      end: "11:30",
      reason: " repair ",
    });
    expect(ok).toEqual({ ok: true, startMinute: 600, endMinute: 690, reason: "repair" });
    const bad = validateWindow(config, { targetId: "", start: "11:00", end: "10:00", reason: "" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors.targetId).toBeTruthy();
      expect(bad.errors.end).toContain("after the start");
    }
  });
});
