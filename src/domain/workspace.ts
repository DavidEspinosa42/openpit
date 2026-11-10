import { checkWorkspaceReferences, type IntegrityIssue } from "./references.ts";
import { WorkspaceSchema } from "./schemas.ts";
import type { Workspace } from "./types.ts";

/** Import files larger than this are rejected before parsing (5 MiB). */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export type ParseResult =
  | { readonly ok: true; readonly workspace: Workspace }
  | { readonly ok: false; readonly issues: readonly IntegrityIssue[] };

function formatPath(path: readonly PropertyKey[]): string {
  let out = "";
  for (const part of path) {
    out += typeof part === "number" ? `[${part}]` : out === "" ? String(part) : `.${String(part)}`;
  }
  return out === "" ? "(root)" : out;
}

/**
 * Parses untrusted JSON text: size limit, JSON syntax, schema, then references.
 * Never throws. Nothing is written anywhere; callers persist only on `ok: true` (invariant 8).
 */
export function parseWorkspaceText(text: string): ParseResult {
  if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) {
    return {
      ok: false,
      issues: [{ path: "(file)", message: `file is larger than ${MAX_IMPORT_BYTES} bytes` }],
    };
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, issues: [{ path: "(file)", message: "not valid JSON" }] };
  }
  return parseWorkspace(data);
}

/** Validates an already-parsed value against the schema and the reference checks. */
export function parseWorkspace(data: unknown): ParseResult {
  const parsed = WorkspaceSchema.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        path: formatPath(issue.path),
        message: issue.message,
      })),
    };
  }
  const issues = checkWorkspaceReferences(parsed.data);
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, workspace: parsed.data };
}
