import { readFileSync, statSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  createLookup,
  formatConflict,
  isValidDateString,
  MAX_IMPORT_BYTES,
  parseWorkspaceText,
} from "../src/domain/index.ts";
import { validateDay } from "../src/engine/index.ts";

/**
 * Validates a workspace file and reports scheduling conflicts.
 *
 *   pnpm validate <file> [--date YYYY-MM-DD] [--json]
 *
 * Exit codes: 0 no blocking conflicts, 1 at least one blocking conflict, 2 invalid input.
 */

const USAGE = "Usage: pnpm validate <file> [--date YYYY-MM-DD] [--json]";

function fail(message: string, json: boolean): never {
  if (json) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
  } else {
    process.stderr.write(`${message}\n`);
  }
  process.exit(2);
}

function readArgs() {
  try {
    return parseArgs({
      args: process.argv.slice(2),
      options: { date: { type: "string" }, json: { type: "boolean" } },
      allowPositionals: true,
    });
  } catch (error) {
    return fail(
      `${(error as Error).message}
${USAGE}`,
      process.argv.includes("--json"),
    );
  }
}

function main(): void {
  const parsed = readArgs();
  const json = parsed.values.json === true;
  const file = parsed.positionals[0];
  if (!file || parsed.positionals.length > 1) fail(USAGE, json);
  const date = parsed.values.date;
  if (date !== undefined && !isValidDateString(date)) {
    fail(`Invalid --date "${date}". Expected a calendar date YYYY-MM-DD.`, json);
  }

  let text: string;
  try {
    if (statSync(file).size > MAX_IMPORT_BYTES) {
      fail(`${file} is larger than ${MAX_IMPORT_BYTES} bytes.`, json);
    }
    text = readFileSync(file, "utf8");
  } catch (error) {
    fail(`Cannot read ${file}: ${(error as Error).message}`, json);
  }

  const result = parseWorkspaceText(text);
  if (!result.ok) {
    if (json) {
      process.stdout.write(`${JSON.stringify({ ok: false, issues: result.issues }, null, 2)}\n`);
    } else {
      process.stderr.write(`Invalid workspace file ${file}:\n`);
      for (const issue of result.issues)
        process.stderr.write(`  ${issue.path}: ${issue.message}\n`);
    }
    process.exit(2);
  }

  const { workspace } = result;
  const days = date === undefined ? workspace.days : workspace.days.filter((d) => d.date === date);
  if (date !== undefined && days.length === 0) fail(`No day ${date} in ${file}.`, json);

  let blockingTotal = 0;
  const report = days.map((day) => {
    const conflicts = validateDay(workspace.config, day);
    const lookup = createLookup(workspace.config, day);
    const blocking = conflicts.filter((c) => c.severity === "blocking").length;
    blockingTotal += blocking;
    return {
      date: day.date,
      blocking,
      warnings: conflicts.length - blocking,
      conflicts: conflicts.map((c) => ({ ...c, message: formatConflict(c, lookup) })),
    };
  });

  if (json) {
    process.stdout.write(
      `${JSON.stringify({ ok: true, blocking: blockingTotal, days: report }, null, 2)}\n`,
    );
  } else {
    for (const day of report) {
      process.stdout.write(`${day.date}: ${day.blocking} blocking, ${day.warnings} warning(s)\n`);
      for (const c of day.conflicts) {
        const tag = c.severity === "blocking" ? "BLOCKING" : "WARNING ";
        process.stdout.write(`  [${tag}] ${c.code}: ${c.message}\n`);
      }
    }
  }
  process.exit(blockingTotal > 0 ? 1 : 0);
}

main();
