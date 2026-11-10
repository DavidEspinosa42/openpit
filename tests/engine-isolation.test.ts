import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const engineDir = join(import.meta.dirname, "..", "src", "engine");

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else if (full.endsWith(".ts")) out.push(full);
  }
  return out;
}

function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const pattern =
    /(?:import|export)\s[^;]*?from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    specs.push((match[1] ?? match[2] ?? match[3]) as string);
  }
  return specs;
}

describe("engine isolation", () => {
  it("imports only from src/domain or from inside src/engine", () => {
    const violations: string[] = [];
    for (const file of listFiles(engineDir)) {
      for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
        if (!spec.startsWith(".")) {
          violations.push(`${relative(engineDir, file)} imports package "${spec}"`);
          continue;
        }
        const target = join(file, "..", spec);
        const rel = relative(join(engineDir, ".."), target).split(sep).join("/");
        const allowed = rel.startsWith("domain/") || rel.startsWith("engine/");
        if (!allowed) violations.push(`${relative(engineDir, file)} imports "${spec}"`);
      }
    }
    expect(violations).toEqual([]);
  });
});
