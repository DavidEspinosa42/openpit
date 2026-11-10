import { afterEach, describe, expect, it } from "vitest";
import { generateDay, type ScheduleDay } from "../../src/domain/index.ts";
import type { SqlDatabase, SqlTransaction } from "../../src/storage/db.ts";
import {
  createRepository,
  IntegrityError,
  MissingConfigError,
  StaleRevisionError,
} from "../../src/storage/repository.ts";
import { closeAll, loadSample, memoryStorage } from "./helpers.ts";

afterEach(closeAll);

function sampleDay(): ScheduleDay {
  const day = loadSample().days[0];
  if (!day) throw new Error("fixture has no day");
  return day;
}

function passthrough(db: SqlDatabase): Pick<SqlDatabase, "query" | "exec" | "close"> {
  return {
    query: (sql, params) => db.query(sql, params),
    exec: (sql) => db.exec(sql),
    close: () => db.close(),
  };
}

describe("repository", () => {
  it("starts empty", async () => {
    const { repository } = await memoryStorage();
    expect(await repository.hasWorkspace()).toBe(false);
    expect(await repository.getConfig()).toBeNull();
    expect(await repository.exportWorkspace()).toBeNull();
    expect(await repository.listDates()).toEqual([]);
    expect(await repository.getDay("2026-06-13")).toBeNull();
  });

  it("refuses to save a day before a configuration exists", async () => {
    const { repository } = await memoryStorage();
    await expect(repository.saveDay(sampleDay())).rejects.toBeInstanceOf(MissingConfigError);
  });

  it("round-trips the sample workspace exactly, including a conflicted schedule", async () => {
    const { repository } = await memoryStorage();
    const sample = loadSample();
    await repository.replaceWorkspace(sample);
    expect(await repository.hasWorkspace()).toBe(true);
    expect(await repository.exportWorkspace()).toEqual(sample);
    expect(await repository.listDates()).toEqual(["2026-06-13"]);
  });

  it("round-trips a large generated day", async () => {
    const { repository } = await memoryStorage();
    const sample = loadSample();
    const day = generateDay(sample.config, { seed: 9, date: "2026-07-01", sessionCount: 200 });
    await repository.replaceWorkspace({ ...sample, days: [day] });
    expect(await repository.getDay("2026-07-01")).toEqual(day);
  });

  it("bumps the revision on every save", async () => {
    const { repository } = await memoryStorage();
    const sample = loadSample();
    await repository.replaceWorkspace({ ...sample, days: [] });
    const fresh = { ...sampleDay(), revision: 0 };
    const first = await repository.saveDay(fresh);
    expect(first.revision).toBe(1);
    const second = await repository.saveDay({ ...first, sessions: first.sessions.slice(1) });
    expect(second.revision).toBe(2);
    const stored = await repository.getDay("2026-06-13");
    expect(stored?.revision).toBe(2);
    expect(stored?.sessions).toHaveLength(fresh.sessions.length - 1);
  });

  it("rejects a save based on a stale revision and leaves the day untouched", async () => {
    const { repository } = await memoryStorage();
    await repository.replaceWorkspace({ ...loadSample(), days: [] });
    const first = await repository.saveDay({ ...sampleDay(), revision: 0 });
    await repository.saveDay({ ...first, sessions: [] });
    await expect(
      repository.saveDay({ ...first, sessions: first.sessions.slice(2) }),
    ).rejects.toBeInstanceOf(StaleRevisionError);
    expect((await repository.getDay("2026-06-13"))?.sessions).toEqual([]);
  });

  it("accepts a conflicted schedule but rejects broken references without writing", async () => {
    const { repository } = await memoryStorage();
    await repository.replaceWorkspace(loadSample());
    const day = await repository.getDay("2026-06-13");
    if (!day?.sessions[0]) throw new Error("fixture");
    const broken = {
      ...day,
      sessions: [{ ...day.sessions[0], vehicleIds: ["ghost"] }, ...day.sessions.slice(1)],
    };
    await expect(repository.saveDay(broken)).rejects.toBeInstanceOf(IntegrityError);
    expect(await repository.getDay("2026-06-13")).toEqual(day);
  });

  it("rejects a day with an invalid time block", async () => {
    const { repository } = await memoryStorage();
    await repository.replaceWorkspace(loadSample());
    const day = await repository.getDay("2026-06-13");
    if (!day?.sessions[0]) throw new Error("fixture");
    const backwards = {
      ...day,
      sessions: [{ ...day.sessions[0], startMinute: 600, endMinute: 540 }],
    };
    await expect(repository.saveDay(backwards)).rejects.toBeInstanceOf(IntegrityError);
  });

  it("deletes a day with everything attached to it", async () => {
    const { repository, db } = await memoryStorage();
    await repository.replaceWorkspace(loadSample());
    await repository.deleteDay("2026-06-13");
    expect(await repository.listDates()).toEqual([]);
    const tables = [
      "session",
      "session_vehicle",
      "session_pit_box",
      "track_closure",
      "vehicle_unavailability",
    ];
    for (const table of tables) {
      const rows = await db.query(`SELECT 1 FROM ${table}`);
      expect(rows.rows).toHaveLength(0);
    }
  });
});

describe("all-or-nothing import", () => {
  it("keeps the old data when the new file is invalid", async () => {
    const { repository } = await memoryStorage();
    const sample = loadSample();
    await repository.replaceWorkspace(sample);

    const bad = structuredClone(sample);
    bad.days[0]?.sessions[0]?.vehicleIds.push("ghost");
    await expect(repository.replaceWorkspace(bad)).rejects.toBeInstanceOf(IntegrityError);
    await expect(repository.replaceWorkspace({ nonsense: true })).rejects.toBeInstanceOf(
      IntegrityError,
    );
    await expect(repository.replaceWorkspace(null)).rejects.toBeInstanceOf(IntegrityError);

    expect(await repository.exportWorkspace()).toEqual(sample);
  });

  it("starts no transaction at all when validation fails", async () => {
    const { db } = await memoryStorage();
    let transactions = 0;
    const spy: SqlDatabase = {
      ...passthrough(db),
      transaction(callback) {
        transactions++;
        return db.transaction(callback);
      },
    };
    const repository = createRepository(spy);
    await expect(repository.replaceWorkspace({ formatVersion: 1 })).rejects.toBeInstanceOf(
      IntegrityError,
    );
    expect(transactions).toBe(0);
  });

  it("rolls back everything when the write fails halfway", async () => {
    const { db, repository } = await memoryStorage();
    const sample = loadSample();
    await repository.replaceWorkspace({ ...sample, days: [] });
    const before = await repository.exportWorkspace();

    // Fail on the fifth statement inside the import transaction.
    let statements = 0;
    const flaky: SqlDatabase = {
      ...passthrough(db),
      transaction: (callback) =>
        db.transaction((tx) =>
          callback({
            exec: (sql) => tx.exec(sql),
            query: (sql, params) => {
              statements++;
              if (statements === 5) return Promise.reject(new Error("disk full"));
              return tx.query(sql, params);
            },
          } satisfies SqlTransaction),
        ),
    };
    const other = { ...sample, config: { ...sample.config, name: "Replaced School" } };
    await expect(createRepository(flaky).replaceWorkspace(other)).rejects.toThrow("disk full");
    expect(statements).toBeGreaterThanOrEqual(5);
    expect(await repository.exportWorkspace()).toEqual(before);
  });
});
