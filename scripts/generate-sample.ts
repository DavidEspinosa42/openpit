import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  FORMAT_VERSION,
  generateDay,
  isValidDateString,
  parseWorkspaceText,
  type ScheduleDay,
  type Workspace,
} from "../src/domain/index.ts";

/**
 * Generates a synthetic workspace: the configuration of an existing workspace file plus
 * seeded random days. The output is fictional and deterministic for a given seed.
 *
 *   pnpm generate:sample [--config file] [--seed N] [--days N] [--sessions N] [--start YYYY-MM-DD] [--out file]
 *
 * Without --out the JSON goes to standard output. Exit code 2 on invalid input.
 */

const DEFAULT_CONFIG = new URL("../data/samples/fictional-ridge.json", import.meta.url);

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

function positiveInt(
  name: string,
  value: string | undefined,
  fallback: number,
  max: number,
): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > max)
    fail(`--${name} must be an integer from 0 to ${max}.`);
  return n;
}

function addDays(date: string, offset: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const result = new Date(Date.UTC(y, m - 1, d + offset));
  return result.toISOString().slice(0, 10);
}

function main(): void {
  let values: Record<string, string | undefined>;
  try {
    values = parseArgs({
      args: process.argv.slice(2),
      options: {
        config: { type: "string" },
        seed: { type: "string" },
        days: { type: "string" },
        sessions: { type: "string" },
        start: { type: "string" },
        out: { type: "string" },
      },
    }).values;
  } catch (error) {
    fail((error as Error).message);
  }

  const seed = positiveInt("seed", values.seed, 1, 2 ** 31);
  const dayCount = positiveInt("days", values.days, 1, 400);
  const sessionCount = positiveInt("sessions", values.sessions, 40, 2000);
  const start = values.start ?? "2026-06-13";
  if (!isValidDateString(start)) fail(`Invalid --start "${start}". Expected YYYY-MM-DD.`);

  let text: string;
  try {
    text = readFileSync(values.config ?? DEFAULT_CONFIG, "utf8");
  } catch (error) {
    fail(`Cannot read config: ${(error as Error).message}`);
  }
  const parsed = parseWorkspaceText(text);
  if (!parsed.ok)
    fail(`Invalid config file: ${parsed.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);

  const days: ScheduleDay[] = [];
  for (let i = 0; i < dayCount; i++) {
    days.push(
      generateDay(parsed.workspace.config, {
        seed: seed + i,
        date: addDays(start, i),
        sessionCount,
      }),
    );
  }
  const output: Workspace = {
    formatVersion: FORMAT_VERSION,
    config: parsed.workspace.config,
    days,
  };

  // The generator must only produce files that the importer accepts.
  const check = parseWorkspaceText(JSON.stringify(output));
  if (!check.ok)
    fail(`Internal error: generated workspace is invalid (${check.issues[0]?.message}).`);

  const json = `${JSON.stringify(output, null, 2)}\n`;
  if (values.out) writeFileSync(values.out, json);
  else process.stdout.write(json);
}

main();
