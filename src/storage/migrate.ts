import type { SqlDatabase } from "./db.ts";
import { MIGRATIONS, type Migration } from "./migrations.generated.ts";

export interface MigrationResult {
  readonly from: number;
  readonly to: number;
}

export class SchemaTooNewError extends Error {
  constructor(found: number, supported: number) {
    super(
      `The database has schema version ${found}, but this version of OpenPit supports up to ${supported}.`,
    );
    this.name = "SchemaTooNewError";
  }
}

/**
 * Applies pending numbered migrations, each in its own transaction together with its
 * schema_version row. A failed migration leaves the database at the previous version.
 * No ORM, no down migrations.
 */
export async function migrate(
  db: SqlDatabase,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<MigrationResult> {
  await db.exec(
    "CREATE TABLE IF NOT EXISTS schema_version (version integer PRIMARY KEY, name text NOT NULL)",
  );
  const current = await currentVersion(db);
  const latest = migrations.reduce((max, m) => Math.max(max, m.version), 0);
  if (current > latest) throw new SchemaTooNewError(current, latest);

  const pending = [...migrations]
    .sort((a, b) => a.version - b.version)
    .filter((m) => m.version > current);
  for (const migration of pending) {
    await db.transaction(async (tx) => {
      await tx.exec(migration.sql);
      await tx.query("INSERT INTO schema_version (version, name) VALUES ($1, $2)", [
        migration.version,
        migration.name,
      ]);
    });
  }
  return { from: current, to: await currentVersion(db) };
}

export async function currentVersion(db: SqlDatabase): Promise<number> {
  const result = await db.query<{ version: number | null }>(
    "SELECT max(version) AS version FROM schema_version",
  );
  return result.rows[0]?.version ?? 0;
}
