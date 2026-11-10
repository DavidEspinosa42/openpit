import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAX_IMPORT_BYTES,
  parseWorkspace,
  parseWorkspaceText,
  type Workspace,
} from "../../src/domain/index.ts";

const samplePath = join(import.meta.dirname, "..", "..", "data", "samples", "fictional-ridge.json");
const sampleText = readFileSync(samplePath, "utf8");

function sample(): Workspace {
  return JSON.parse(sampleText) as Workspace;
}

function issuesOf(value: unknown): string[] {
  const result = parseWorkspace(value);
  return result.ok ? [] : result.issues.map((i) => `${i.path}: ${i.message}`);
}

describe("sample workspace", () => {
  it("validates", () => {
    const result = parseWorkspaceText(sampleText);
    expect(result.ok).toBe(true);
  });
});

describe("schema", () => {
  it("rejects a wrong formatVersion", () => {
    const ws = { ...sample(), formatVersion: 2 };
    expect(issuesOf(ws).join("\n")).toContain("formatVersion");
  });

  it("rejects unknown keys, which keeps person fields out", () => {
    const ws = sample();
    (ws.days[0]?.sessions[0] as Record<string, unknown>).instructorName = "someone";
    expect(issuesOf(ws).join("\n")).toContain("instructorName");
  });

  it("rejects end <= start", () => {
    const ws = sample();
    const session = ws.days[0]?.sessions[0];
    if (!session) throw new Error("fixture");
    session.endMinute = session.startMinute;
    expect(issuesOf(ws).join("\n")).toContain("endMinute must be greater");
  });

  it("rejects times beyond the end of the day", () => {
    const ws = sample();
    const session = ws.days[0]?.sessions[0];
    if (!session) throw new Error("fixture");
    session.endMinute = 1441;
    expect(issuesOf(ws)).not.toEqual([]);
  });

  it("rejects an impossible date", () => {
    const ws = sample();
    const day = ws.days[0];
    if (!day) throw new Error("fixture");
    day.date = "2026-02-30";
    expect(issuesOf(ws).join("\n")).toContain("calendar date");
  });

  it("rejects a grid that does not divide the day", () => {
    const ws = sample();
    ws.config.gridMinutes = 7;
    expect(issuesOf(ws).join("\n")).toContain("gridMinutes");
  });

  it("rejects malformed ids", () => {
    const ws = sample();
    const vehicle = ws.config.vehicles[0];
    if (!vehicle) throw new Error("fixture");
    vehicle.id = "has space";
    expect(issuesOf(ws).join("\n")).toContain("invalid id");
  });

  it("accepts a workspace with no days", () => {
    const ws = { ...sample(), days: [] };
    expect(parseWorkspace(ws).ok).toBe(true);
  });
});

describe("reference checks", () => {
  it("rejects an unknown vehicle", () => {
    const ws = sample();
    ws.days[0]?.sessions[0]?.vehicleIds.push("ghost");
    expect(issuesOf(ws).join("\n")).toContain('unknown vehicle "ghost"');
  });

  it("rejects an unknown layout and activity type", () => {
    const ws = sample();
    const session = ws.days[0]?.sessions.find((s) => s.layoutId !== null);
    if (!session) throw new Error("fixture");
    session.layoutId = "l-nope";
    session.activityTypeId = "a-nope";
    const text = issuesOf(ws).join("\n");
    expect(text).toContain('unknown layout "l-nope"');
    expect(text).toContain('unknown activity type "a-nope"');
  });

  it("rejects duplicate ids", () => {
    const ws = sample();
    const day = ws.days[0];
    const first = day?.sessions[0];
    if (!day || !first) throw new Error("fixture");
    day.sessions.push({ ...first });
    expect(issuesOf(ws).join("\n")).toContain("duplicate id");
  });

  it("rejects a track activity without a layout and an off-track activity with one", () => {
    const ws = sample();
    const day = ws.days[0];
    const track = day?.sessions.find((s) => s.activityTypeId === "a-practice");
    const off = day?.sessions.find((s) => s.activityTypeId === "a-prep");
    if (!track || !off) throw new Error("fixture");
    track.layoutId = null;
    off.layoutId = "l-full";
    const text = issuesOf(ws).join("\n");
    expect(text).toContain("track activities require a layout");
    expect(text).toContain("off-track activities must not have a layout");
  });

  it("rejects times off the grid", () => {
    const ws = sample();
    const session = ws.days[0]?.sessions[0];
    if (!session) throw new Error("fixture");
    session.startMinute = 452;
    expect(issuesOf(ws).join("\n")).toContain("multiples of 5 minutes");
  });

  it("rejects a closure on an unknown section and an unavailability for an unknown vehicle", () => {
    const ws = sample();
    const day = ws.days[0];
    if (!day?.closures[0] || !day.unavailabilities[0]) throw new Error("fixture");
    day.closures[0].sectionId = "s-nope";
    day.unavailabilities[0].vehicleId = "v-nope";
    const text = issuesOf(ws).join("\n");
    expect(text).toContain('unknown section "s-nope"');
    expect(text).toContain('unknown vehicle "v-nope"');
  });

  it("rejects layouts that point at unknown sections or categories", () => {
    const ws = sample();
    const layout = ws.config.circuit.layouts[0];
    if (!layout) throw new Error("fixture");
    layout.sectionIds.push("s-nope");
    layout.capacity["c-nope"] = 3;
    const text = issuesOf(ws).join("\n");
    expect(text).toContain('unknown section "s-nope"');
    expect(text).toContain('unknown category "c-nope"');
  });

  it("rejects duplicate dates", () => {
    const ws = sample();
    const day = ws.days[0];
    if (!day) throw new Error("fixture");
    ws.days.push(structuredClone(day));
    expect(issuesOf(ws).join("\n")).toContain('duplicate day "2026-06-13"');
  });

  it("accepts a conflicted schedule: conflicts are data, not integrity errors", () => {
    expect(parseWorkspaceText(sampleText).ok).toBe(true);
  });
});

describe("parseWorkspaceText", () => {
  it("reports invalid JSON without throwing", () => {
    const result = parseWorkspaceText("{not json");
    expect(result.ok).toBe(false);
  });
  it("rejects oversized input", () => {
    const result = parseWorkspaceText(" ".repeat(MAX_IMPORT_BYTES + 1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.message).toContain("larger than");
  });
  it("rejects non-object roots", () => {
    expect(parseWorkspaceText("[]").ok).toBe(false);
    expect(parseWorkspaceText("null").ok).toBe(false);
  });
});
