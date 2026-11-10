import type { SqlDatabase } from "./db.ts";

/** A database that can flush its in-memory state to its backing store (PGlite's `syncToFs`). */
export interface SyncableDatabase extends SqlDatabase {
  syncToFs(): Promise<void>;
}

/**
 * Makes every committed transaction durable before its promise resolves.
 *
 * Found in the M4 spike (docs/adr/0004): with `idb://` storage, PGlite 0.5.14 did not flush the
 * changes of a transaction to IndexedDB until a later query ran, so the last save was lost when
 * the page was reloaded right after it. Calling `syncToFs()` after the commit fixes that. All
 * repository writes are transactions, so wrapping `transaction` is enough.
 */
export function withDurableTransactions(db: SyncableDatabase): SqlDatabase {
  return {
    query: (sql, params) => db.query(sql, params),
    exec: (sql) => db.exec(sql),
    async transaction(callback) {
      const result = await db.transaction(callback);
      await db.syncToFs();
      return result;
    },
    close: () => db.close(),
  };
}
