import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Workspace } from "../../src/domain/index.ts";
import type { SqlDatabase } from "../../src/storage/db.ts";
import { openStorage, type Storage } from "../../src/storage/pglite.ts";

const samplePath = join(import.meta.dirname, "..", "..", "data", "samples", "fictional-ridge.json");

export function loadSample(): Workspace {
  return JSON.parse(readFileSync(samplePath, "utf8")) as Workspace;
}

const opened: SqlDatabase[] = [];

/** Fresh in-memory database with migrations applied. Closed by closeAll(). */
export async function memoryStorage(): Promise<Storage> {
  const storage = await openStorage();
  opened.push(storage.db);
  return storage;
}

export function track(db: SqlDatabase): SqlDatabase {
  opened.push(db);
  return db;
}

export async function closeAll(): Promise<void> {
  while (opened.length > 0) await opened.pop()?.close();
}
