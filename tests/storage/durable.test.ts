import { describe, expect, it } from "vitest";
import type { SqlTransaction } from "../../src/storage/db.ts";
import { type SyncableDatabase, withDurableTransactions } from "../../src/storage/durable.ts";

function fakeDb(events: string[], failTransaction = false): SyncableDatabase {
  return {
    async query() {
      events.push("query");
      return { rows: [] };
    },
    async exec() {
      events.push("exec");
    },
    async transaction<T>(callback: (tx: SqlTransaction) => Promise<T>) {
      events.push("begin");
      const result = await callback({ query: async () => ({ rows: [] }), exec: async () => {} });
      if (failTransaction) throw new Error("rolled back");
      events.push("commit");
      return result;
    },
    async syncToFs() {
      events.push("sync");
    },
    async close() {
      events.push("close");
    },
  };
}

describe("withDurableTransactions", () => {
  it("syncs after a committed transaction, before resolving", async () => {
    const events: string[] = [];
    const db = withDurableTransactions(fakeDb(events));
    const value = await db.transaction(async () => 42);
    events.push("resolved");
    expect(value).toBe(42);
    expect(events).toEqual(["begin", "commit", "sync", "resolved"]);
  });

  it("does not sync when the transaction fails", async () => {
    const events: string[] = [];
    const db = withDurableTransactions(fakeDb(events, true));
    await expect(db.transaction(async () => 1)).rejects.toThrow("rolled back");
    expect(events).not.toContain("sync");
  });

  it("passes plain queries and close through untouched", async () => {
    const events: string[] = [];
    const db = withDurableTransactions(fakeDb(events));
    await db.query("SELECT 1");
    await db.exec("SELECT 1");
    await db.close();
    expect(events).toEqual(["query", "exec", "close"]);
  });
});
