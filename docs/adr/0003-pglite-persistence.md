# 0003. PGlite persisted to IndexedDB (proposed, pending spike)

- Status: proposed; to be confirmed or reversed by the M4 spike
- Date: 2026-11-10

## Context

Schedule data is relational (days, sessions, vehicles and pit boxes per session, closures, unavailability). Saves must be transactional. Repository tests should run in Node.

## Decision

Use PGlite (`@electric-sql/pglite`) persisted to IndexedDB (`idb://`), with numbered SQL migrations and a `schema_version` table, no ORM. The school configuration is one validated JSONB document because the MVP loads and replaces it whole.

## Consequences

- Transactions, foreign keys and CHECK constraints; SQL available for later reports; the same code runs in memory under Node for tests.
- Costs: a multi-megabyte WASM download, a 0.x API, and a single-tab restriction (handled with the Web Locks API).
- Uncertainty: bundling with Turbopack and static export is unverified. The spike in M4 decides. The fallback is an IndexedDB document store behind the same repository interface, recorded in a new ADR.
