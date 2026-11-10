import { describe, expect, it } from "vitest";
import { acquireWriterLock, type LockProvider } from "../../src/storage/lock.ts";

/** Minimal model of navigator.locks with ifAvailable semantics. */
function fakeLocks(): LockProvider {
  const held = new Set<string>();
  return {
    async request(name, _options, callback) {
      if (held.has(name)) return callback(null);
      held.add(name);
      try {
        return await callback({ name });
      } finally {
        held.delete(name);
      }
    },
  };
}

describe("writer lock", () => {
  it("gives the lock to the first tab only", async () => {
    const locks = fakeLocks();
    const first = await acquireWriterLock(locks);
    expect(first?.exclusive).toBe(true);
    expect(await acquireWriterLock(locks)).toBeNull();
  });

  it("can be acquired again after release", async () => {
    const locks = fakeLocks();
    const first = await acquireWriterLock(locks);
    first?.release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await acquireWriterLock(locks)).not.toBeNull();
  });

  it("uses separate locks for separate names", async () => {
    const locks = fakeLocks();
    await acquireWriterLock(locks, "a");
    expect(await acquireWriterLock(locks, "b")).not.toBeNull();
  });

  it("reports a non-exclusive handle when Web Locks are unavailable", async () => {
    const lock = await acquireWriterLock(null);
    expect(lock).toEqual({ exclusive: false, release: expect.any(Function) });
  });
});
