import { describe, expect, it } from "vitest";
import {
  formatMinute,
  gapBetween,
  intervalContains,
  intervalsOverlap,
  isOnGrid,
  isValidDateString,
  isValidInterval,
  parseTime,
} from "../../src/domain/time.ts";

const iv = (startMinute: number, endMinute: number) => ({ startMinute, endMinute });

describe("intervalsOverlap", () => {
  it("detects overlap", () => {
    expect(intervalsOverlap(iv(0, 60), iv(30, 90))).toBe(true);
    expect(intervalsOverlap(iv(30, 90), iv(0, 60))).toBe(true);
  });
  it("detects containment", () => {
    expect(intervalsOverlap(iv(0, 100), iv(20, 30))).toBe(true);
  });
  it("treats touching intervals as non-overlapping", () => {
    expect(intervalsOverlap(iv(0, 60), iv(60, 120))).toBe(false);
    expect(intervalsOverlap(iv(60, 120), iv(0, 60))).toBe(false);
  });
  it("overlaps by a single minute", () => {
    expect(intervalsOverlap(iv(0, 61), iv(60, 120))).toBe(true);
  });
  it("does not overlap when apart", () => {
    expect(intervalsOverlap(iv(0, 30), iv(60, 90))).toBe(false);
  });
});

describe("gapBetween", () => {
  it("is zero for touching intervals", () => {
    expect(gapBetween(iv(0, 60), iv(60, 90))).toBe(0);
  });
  it("is symmetric", () => {
    expect(gapBetween(iv(0, 60), iv(75, 90))).toBe(15);
    expect(gapBetween(iv(75, 90), iv(0, 60))).toBe(15);
  });
  it("is negative for overlapping intervals", () => {
    expect(gapBetween(iv(0, 60), iv(50, 90))).toBe(-10);
  });
});

describe("intervalContains", () => {
  it("includes equal bounds", () => {
    expect(intervalContains(iv(480, 1080), iv(480, 1080))).toBe(true);
  });
  it("rejects intervals sticking out on either side", () => {
    expect(intervalContains(iv(480, 1080), iv(475, 600))).toBe(false);
    expect(intervalContains(iv(480, 1080), iv(1000, 1085))).toBe(false);
  });
});

describe("isValidInterval", () => {
  it("accepts the whole day", () => {
    expect(isValidInterval(iv(0, 1440))).toBe(true);
  });
  it("rejects empty, reversed, out-of-range and fractional intervals", () => {
    expect(isValidInterval(iv(60, 60))).toBe(false);
    expect(isValidInterval(iv(90, 60))).toBe(false);
    expect(isValidInterval(iv(-5, 60))).toBe(false);
    expect(isValidInterval(iv(0, 1441))).toBe(false);
    expect(isValidInterval(iv(0.5, 60))).toBe(false);
  });
});

describe("isOnGrid", () => {
  it("checks multiples of the grid", () => {
    expect(isOnGrid(0, 5)).toBe(true);
    expect(isOnGrid(1440, 5)).toBe(true);
    expect(isOnGrid(7, 5)).toBe(false);
    expect(isOnGrid(2.5, 5)).toBe(false);
  });
});

describe("formatMinute / parseTime", () => {
  it("round-trips every minute of the day", () => {
    for (let m = 0; m <= 1440; m++) expect(parseTime(formatMinute(m))).toBe(m);
  });
  it("formats edge values", () => {
    expect(formatMinute(0)).toBe("00:00");
    expect(formatMinute(485)).toBe("08:05");
    expect(formatMinute(1440)).toBe("24:00");
  });
  it("rejects invalid text", () => {
    for (const bad of ["", "8", "08:60", "25:00", "24:01", "ab:cd", "8:5"]) {
      expect(parseTime(bad)).toBeNull();
    }
    expect(parseTime("8:05")).toBe(485);
  });
});

describe("isValidDateString", () => {
  it("accepts real dates including leap days", () => {
    expect(isValidDateString("2026-06-13")).toBe(true);
    expect(isValidDateString("2028-02-29")).toBe(true);
  });
  it("rejects impossible or malformed dates", () => {
    for (const bad of [
      "2026-02-29",
      "2026-13-01",
      "2026-00-10",
      "2026-04-31",
      "26-06-13",
      "2026-6-3",
      "",
    ]) {
      expect(isValidDateString(bad)).toBe(false);
    }
  });
});
