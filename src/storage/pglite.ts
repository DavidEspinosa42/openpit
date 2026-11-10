import type { SqlDatabase } from "./db.ts";
import { type SyncableDatabase, withDurableTransactions } from "./durable.ts";
import { migrate } from "./migrate.ts";
import { createRepository, type Repository } from "./repository.ts";

/** Browser database name; the data lives in IndexedDB under this name. */
export const BROWSER_DATA_DIR = "idb://openpit";

/**
 * Opens a PGlite database. Pass `idb://name` in the browser for IndexedDB persistence, or
 * nothing for an in-memory database (tests, Node). PGlite is imported lazily so its WASM
 * is not part of the initial page load.
 */
export async function openDatabase(dataDir?: string): Promise<SqlDatabase> {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite(dataDir);
  await db.waitReady;
  const syncable = db as unknown as SyncableDatabase;
  // Only persistent databases need explicit flushing; in-memory ones are used as they are.
  return dataDir?.startsWith("idb://") ? withDurableTransactions(syncable) : syncable;
}

export interface Storage {
  readonly db: SqlDatabase;
  readonly repository: Repository;
}

/** Opens the database, applies pending migrations and returns the repository. */
export async function openStorage(dataDir?: string): Promise<Storage> {
  const db = await openDatabase(dataDir);
  try {
    await migrate(db);
  } catch (error) {
    await db.close();
    throw error;
  }
  return { db, repository: createRepository(db) };
}
