import { afterEach, describe, expect, it } from "vitest";
import { renderMigrations } from "../../scripts/build-migrations.ts";
import { currentVersion, migrate, SchemaTooNewError } from "../../src/storage/migrate.ts";
import { MIGRATIONS } from "../../src/storage/migrations.generated.ts";
import { openDatabase } from "../../src/storage/pglite.ts";
import { closeAll, track } from "./helpers.ts";

afterEach(closeAll);

async function emptyDb() {
  return track(await openDatabase());
}

describe("migrations", () => {
  it("generated migrations match the SQL files", () => {
    // renderMigrations() re-reads the .sql files; the committed module must contain the same SQL.
    const fresh = renderMigrations();
    for (const migration of MIGRATIONS) {
      expect(fresh).toContain(JSON.stringify(migration.sql));
    }
    expect(MIGRATIONS.map((m) => m.version)).toEqual([1]);
  });

  it("migrates from an empty database", async () => {
    const db = await emptyDb();
    expect(await migrate(db)).toEqual({ from: 0, to: 1 });
    expect(await currentVersion(db)).toBe(1);
    const tables = await db.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    );
    expect(tables.rows.map((r) => r.table_name)).toEqual([
      "schedule_day",
      "schema_version",
      "session",
      "session_pit_box",
      "session_vehicle",
      "track_closure",
      "vehicle_unavailability",
      "workspace_config",
    ]);
  });

  it("is idempotent", async () => {
    const db = await emptyDb();
    await migrate(db);
    expect(await migrate(db)).toEqual({ from: 1, to: 1 });
  });

  it("refuses a database written by a newer version", async () => {
    const db = await emptyDb();
    await migrate(db);
    await db.query("INSERT INTO schema_version (version, name) VALUES (99, 'future')");
    await expect(migrate(db)).rejects.toBeInstanceOf(SchemaTooNewError);
  });

  it("rolls back a failing migration and keeps the previous version", async () => {
    const db = await emptyDb();
    await migrate(db);
    const broken = [
      ...MIGRATIONS,
      {
        version: 2,
        name: "broken",
        sql: "CREATE TABLE half_done (x integer); SELECT nope FROM nowhere;",
      },
    ];
    await expect(migrate(db, broken)).rejects.toThrow();
    expect(await currentVersion(db)).toBe(1);
    const leftover = await db.query(
      "SELECT 1 FROM information_schema.tables WHERE table_name = 'half_done'",
    );
    expect(leftover.rows).toHaveLength(0);
  });
});
