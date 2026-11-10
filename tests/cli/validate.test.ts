import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
const sample = join(root, "data", "samples", "fictional-ridge.json");
const fixture = (name: string) => join(root, "tests", "fixtures", name);

function run(script: string, args: string[]) {
  const result = spawnSync(process.execPath, [join(root, "scripts", script), ...args], {
    encoding: "utf8",
    cwd: root,
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

const validate = (...args: string[]) => run("validate-schedule.ts", args);

describe("validate CLI exit codes", () => {
  it("exits 0 when there are no blocking conflicts", () => {
    const r = validate(fixture("clean.json"));
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("0 blocking");
  });

  it("exits 1 when there are blocking conflicts", () => {
    const r = validate(sample);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("[BLOCKING] TRACK_CLOSED");
    expect(r.stdout).toContain("[WARNING ] NO_VEHICLES_ASSIGNED");
  });

  it("exits 2 for invalid JSON, invalid references, missing files and bad arguments", () => {
    expect(validate(fixture("not-json.txt")).code).toBe(2);
    const dangling = validate(fixture("dangling-reference.json"));
    expect(dangling.code).toBe(2);
    expect(dangling.stderr).toContain('unknown vehicle "ghost"');
    expect(validate(fixture("does-not-exist.json")).code).toBe(2);
    expect(validate().code).toBe(2);
    expect(validate(sample, "--date", "2026-02-30").code).toBe(2);
    expect(validate(sample, "--date", "2030-01-01").code).toBe(2);
    expect(validate(sample, "--nope").code).toBe(2);
  });
});

describe("validate CLI --json", () => {
  it("prints machine-readable conflicts", () => {
    const r = validate(sample, "--json");
    expect(r.code).toBe(1);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(true);
    expect(out.blocking).toBe(14);
    expect(out.days).toHaveLength(1);
    const codes = out.days[0].conflicts.map((c: { code: string }) => c.code);
    expect(codes).toContain("PIT_BOX_CAPACITY_EXCEEDED");
    expect(out.days[0].conflicts[0]).toMatchObject({
      code: "OUTSIDE_OPERATING_HOURS",
      severity: "blocking",
      sessionIds: ["evening"],
    });
    expect(typeof out.days[0].conflicts[0].message).toBe("string");
  });

  it("reports invalid input as JSON with exit code 2", () => {
    const r = validate(fixture("dangling-reference.json"), "--json");
    expect(r.code).toBe(2);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: false });
  });

  it("selects a day with --date", () => {
    const r = validate(sample, "--date", "2026-06-13", "--json");
    expect(r.code).toBe(1);
  });

  it("produces identical output on repeated runs", () => {
    expect(validate(sample, "--json").stdout).toBe(validate(sample, "--json").stdout);
  });
});

describe("generate-sample CLI", () => {
  it("is deterministic and produces an importable workspace", () => {
    const a = run("generate-sample.ts", ["--seed", "5", "--days", "2", "--sessions", "20"]);
    const b = run("generate-sample.ts", ["--seed", "5", "--days", "2", "--sessions", "20"]);
    expect(a.code).toBe(0);
    expect(a.stdout).toBe(b.stdout);
    const data = JSON.parse(a.stdout);
    expect(data.days).toHaveLength(2);
    expect(data.days[1].date).toBe("2026-06-14");
    expect(data.days[0].sessions).toHaveLength(20);
  });

  it("rejects bad arguments with exit code 2", () => {
    expect(run("generate-sample.ts", ["--days", "-1"]).code).toBe(2);
    expect(run("generate-sample.ts", ["--start", "nope"]).code).toBe(2);
  });
});
