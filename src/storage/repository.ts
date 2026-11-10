import {
  checkDayReferences,
  type IntegrityIssue,
  parseWorkspace,
  type ScheduleDay,
  ScheduleDaySchema,
  type SchoolConfig,
  SchoolConfigSchema,
  type Workspace,
} from "../domain/index.ts";
import type { SqlDatabase, SqlTransaction } from "./db.ts";

/** Thrown when a save is based on an out-of-date revision of the day. */
export class StaleRevisionError extends Error {
  readonly date: string;
  readonly expected: number;
  readonly actual: number;
  constructor(date: string, expected: number, actual: number) {
    super(`Day ${date} was changed elsewhere (stored revision ${actual}, expected ${expected}).`);
    this.name = "StaleRevisionError";
    this.date = date;
    this.expected = expected;
    this.actual = actual;
  }
}

/** Thrown before any write when data is structurally invalid (schema or references). */
export class IntegrityError extends Error {
  readonly issues: readonly IntegrityIssue[];
  constructor(message: string, issues: readonly IntegrityIssue[]) {
    super(`${message}: ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);
    this.name = "IntegrityError";
    this.issues = issues;
  }
}

export class MissingConfigError extends Error {
  constructor() {
    super("No school configuration is stored yet. Import a workspace first.");
    this.name = "MissingConfigError";
  }
}

export interface Repository {
  /** True when a school configuration is stored. */
  hasWorkspace(): Promise<boolean>;
  getConfig(): Promise<SchoolConfig | null>;
  /** Stored dates, ascending. */
  listDates(): Promise<string[]>;
  getDay(date: string): Promise<ScheduleDay | null>;
  /**
   * Saves one day in a single transaction. `day.revision` must be the revision the caller
   * loaded (0 for a day that is not stored yet). Returns the day with the bumped revision.
   * Scheduling conflicts are accepted; structural problems throw IntegrityError.
   */
  saveDay(day: ScheduleDay): Promise<ScheduleDay>;
  deleteDay(date: string): Promise<void>;
  /**
   * Replaces the whole workspace. Schema and reference validation finish before the first
   * write, and the write is one transaction: it either all happens or none of it does.
   */
  replaceWorkspace(data: unknown): Promise<Workspace>;
  exportWorkspace(): Promise<Workspace | null>;
}

const MAX_PARAMS = 30000;

async function insertRows(
  tx: SqlTransaction,
  table: string,
  columns: readonly string[],
  rows: readonly unknown[][],
): Promise<void> {
  const perChunk = Math.max(1, Math.floor(MAX_PARAMS / columns.length));
  for (let offset = 0; offset < rows.length; offset += perChunk) {
    const chunk = rows.slice(offset, offset + perChunk);
    const placeholders = chunk
      .map((_, r) => `(${columns.map((_c, c) => `$${r * columns.length + c + 1}`).join(", ")})`)
      .join(", ");
    await tx.query(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${placeholders}`,
      chunk.flat(),
    );
  }
}

async function writeDayRows(tx: SqlTransaction, day: ScheduleDay, revision: number): Promise<void> {
  await tx.query(
    `INSERT INTO schedule_day (date, revision) VALUES ($1, $2)
     ON CONFLICT (date) DO UPDATE SET revision = EXCLUDED.revision`,
    [day.date, revision],
  );
  await tx.query("DELETE FROM session WHERE day = $1", [day.date]);
  await tx.query("DELETE FROM track_closure WHERE day = $1", [day.date]);
  await tx.query("DELETE FROM vehicle_unavailability WHERE day = $1", [day.date]);

  await insertRows(
    tx,
    "session",
    [
      "day",
      "id",
      "position",
      "label",
      "activity_type_id",
      "layout_id",
      "start_minute",
      "end_minute",
      "status",
    ],
    day.sessions.map((s, i) => [
      day.date,
      s.id,
      i,
      s.label,
      s.activityTypeId,
      s.layoutId,
      s.startMinute,
      s.endMinute,
      s.status,
    ]),
  );
  await insertRows(
    tx,
    "session_vehicle",
    ["day", "session_id", "position", "vehicle_id"],
    day.sessions.flatMap((s) => s.vehicleIds.map((v, i) => [day.date, s.id, i, v])),
  );
  await insertRows(
    tx,
    "session_pit_box",
    ["day", "session_id", "position", "pit_box_id"],
    day.sessions.flatMap((s) => s.pitBoxIds.map((p, i) => [day.date, s.id, i, p])),
  );
  await insertRows(
    tx,
    "track_closure",
    ["day", "id", "position", "section_id", "start_minute", "end_minute", "reason"],
    day.closures.map((c, i) => [
      day.date,
      c.id,
      i,
      c.sectionId,
      c.startMinute,
      c.endMinute,
      c.reason,
    ]),
  );
  await insertRows(
    tx,
    "vehicle_unavailability",
    ["day", "id", "position", "vehicle_id", "start_minute", "end_minute", "reason"],
    day.unavailabilities.map((u, i) => [
      day.date,
      u.id,
      i,
      u.vehicleId,
      u.startMinute,
      u.endMinute,
      u.reason,
    ]),
  );
}

async function readConfig(q: SqlTransaction): Promise<SchoolConfig | null> {
  const result = await q.query<{ config: unknown }>(
    "SELECT config FROM workspace_config WHERE id = 1",
  );
  const row = result.rows[0];
  if (!row) return null;
  // Rows read from the database are parsed like any other boundary.
  return SchoolConfigSchema.parse(
    typeof row.config === "string" ? JSON.parse(row.config) : row.config,
  );
}

async function readDay(q: SqlTransaction, date: string): Promise<ScheduleDay | null> {
  const dayRow = await q.query<{ revision: number }>(
    "SELECT revision FROM schedule_day WHERE date = $1",
    [date],
  );
  const header = dayRow.rows[0];
  if (!header) return null;

  const [sessions, vehicles, pitBoxes, closures, unavailabilities] = [
    await q.query<{
      id: string;
      label: string;
      activity_type_id: string;
      layout_id: string | null;
      start_minute: number;
      end_minute: number;
      status: string;
    }>("SELECT * FROM session WHERE day = $1 ORDER BY position", [date]),
    await q.query<{ session_id: string; vehicle_id: string }>(
      "SELECT session_id, vehicle_id FROM session_vehicle WHERE day = $1 ORDER BY session_id, position",
      [date],
    ),
    await q.query<{ session_id: string; pit_box_id: string }>(
      "SELECT session_id, pit_box_id FROM session_pit_box WHERE day = $1 ORDER BY session_id, position",
      [date],
    ),
    await q.query<{
      id: string;
      section_id: string;
      start_minute: number;
      end_minute: number;
      reason: string;
    }>("SELECT * FROM track_closure WHERE day = $1 ORDER BY position", [date]),
    await q.query<{
      id: string;
      vehicle_id: string;
      start_minute: number;
      end_minute: number;
      reason: string;
    }>("SELECT * FROM vehicle_unavailability WHERE day = $1 ORDER BY position", [date]),
  ];

  const vehiclesBySession = new Map<string, string[]>();
  for (const row of vehicles.rows) {
    const list = vehiclesBySession.get(row.session_id) ?? [];
    list.push(row.vehicle_id);
    vehiclesBySession.set(row.session_id, list);
  }
  const pitBoxesBySession = new Map<string, string[]>();
  for (const row of pitBoxes.rows) {
    const list = pitBoxesBySession.get(row.session_id) ?? [];
    list.push(row.pit_box_id);
    pitBoxesBySession.set(row.session_id, list);
  }

  return ScheduleDaySchema.parse({
    date,
    revision: header.revision,
    sessions: sessions.rows.map((row) => ({
      id: row.id,
      label: row.label,
      activityTypeId: row.activity_type_id,
      layoutId: row.layout_id,
      startMinute: row.start_minute,
      endMinute: row.end_minute,
      vehicleIds: vehiclesBySession.get(row.id) ?? [],
      pitBoxIds: pitBoxesBySession.get(row.id) ?? [],
      status: row.status,
    })),
    closures: closures.rows.map((row) => ({
      id: row.id,
      sectionId: row.section_id,
      startMinute: row.start_minute,
      endMinute: row.end_minute,
      reason: row.reason,
    })),
    unavailabilities: unavailabilities.rows.map((row) => ({
      id: row.id,
      vehicleId: row.vehicle_id,
      startMinute: row.start_minute,
      endMinute: row.end_minute,
      reason: row.reason,
    })),
  });
}

export function createRepository(db: SqlDatabase): Repository {
  return {
    async hasWorkspace() {
      const result = await db.query("SELECT 1 FROM workspace_config WHERE id = 1");
      return result.rows.length > 0;
    },

    getConfig() {
      return readConfig(db);
    },

    async listDates() {
      const result = await db.query<{ date: string }>(
        "SELECT date FROM schedule_day ORDER BY date",
      );
      return result.rows.map((r) => r.date);
    },

    getDay(date) {
      return readDay(db, date);
    },

    async saveDay(input) {
      const parsed = ScheduleDaySchema.safeParse(input);
      if (!parsed.success) {
        throw new IntegrityError(
          "Invalid day",
          parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        );
      }
      const day = parsed.data;
      return db.transaction(async (tx) => {
        const config = await readConfig(tx);
        if (!config) throw new MissingConfigError();
        const issues = checkDayReferences(config, day);
        if (issues.length > 0) throw new IntegrityError("Invalid day", issues);

        const stored = await tx.query<{ revision: number }>(
          "SELECT revision FROM schedule_day WHERE date = $1 FOR UPDATE",
          [day.date],
        );
        const actual = stored.rows[0]?.revision ?? 0;
        const expected = day.revision;
        if (actual !== expected) throw new StaleRevisionError(day.date, expected, actual);

        const revision = actual + 1;
        await writeDayRows(tx, day, revision);
        return { ...day, revision };
      });
    },

    async deleteDay(date) {
      await db.query("DELETE FROM schedule_day WHERE date = $1", [date]);
    },

    async replaceWorkspace(data) {
      // 1. Validate everything. Nothing has been written yet (invariant 8).
      const parsed = parseWorkspace(data);
      if (!parsed.ok) throw new IntegrityError("Invalid workspace", parsed.issues);
      const { workspace } = parsed;
      // 2. Write everything in one transaction.
      await db.transaction(async (tx) => {
        await tx.query("DELETE FROM schedule_day");
        await tx.query("DELETE FROM workspace_config");
        await tx.query("INSERT INTO workspace_config (id, config) VALUES (1, $1::jsonb)", [
          JSON.stringify(workspace.config),
        ]);
        for (const day of workspace.days) await writeDayRows(tx, day, day.revision);
      });
      return workspace;
    },

    async exportWorkspace() {
      const config = await readConfig(db);
      if (!config) return null;
      const dates = await this.listDates();
      const days: ScheduleDay[] = [];
      for (const date of dates) {
        const day = await readDay(db, date);
        if (day) days.push(day);
      }
      return { formatVersion: 1, config, days };
    },
  };
}
