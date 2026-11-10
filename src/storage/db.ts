/**
 * The smallest SQL surface the repository needs. PGlite satisfies it structurally, so the
 * repository, migrations and tests do not import the database driver.
 */

export interface SqlResult<T> {
  readonly rows: T[];
}

export interface SqlTransaction {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<SqlResult<T>>;
  exec(sql: string): Promise<unknown>;
}

export interface SqlDatabase extends SqlTransaction {
  transaction<T>(callback: (tx: SqlTransaction) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
