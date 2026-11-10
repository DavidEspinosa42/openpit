# 0004. Persistence spike result: PGlite works, with explicit flushing

- Status: accepted
- Date: 2026-11-10
- Confirms [0003](0003-pglite-persistence.md)

## Context

ADR 0003 left two points open: whether PGlite bundles with Turbopack in a static export, and whether data survives a reload. The M4 spike answered both in a real Chromium browser, using the static export served from a local static file server.

## What was tested

A temporary client page opened `idb://`, imported the fictional sample through the repository, saved a day, and was reloaded.

## Results

| Question                                                 | Result                                                                                                                                                           |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does `next build` with `output: 'export'` bundle PGlite? | Yes, with no extra configuration. The `swcMinify` and `transpilePackages` settings from PGlite's Next.js snippet were not needed (Next.js 16.4.4, Turbopack).    |
| Are the WASM files emitted?                              | Yes: `pglite.*.wasm` (about 9 MB), `pglite.*.data` (about 6 MB) and `initdb.*.wasm` (about 0.3 MB) in `out/_next/static/media`. The whole export is about 17 MB. |
| Startup cost                                             | About 2.0 s for the first open (create and initialize), about 0.65 s for later opens, on the development machine.                                                |
| Does an import survive a reload?                         | Yes.                                                                                                                                                             |
| Does a saved transaction survive a reload?               | **No, not by default.** A `saveDay` that returned revision 2 was gone after a reload, while an earlier plain `UPDATE` followed by a `SELECT` persisted.          |

## Cause and fix

With `idb://`, PGlite 0.5.14 did not flush the changes of a `transaction()` to IndexedDB at commit. They were written out by a later query, so a reload right after a save lost it. Calling `db.syncToFs()` after the commit fixed it: the same save persisted across a reload. The flush cause was identified by experiment (plain update persisted, transaction did not, transaction plus `syncToFs()` did); the PGlite source was not read.

Decision: wrap the persistent database in `withDurableTransactions` (`src/storage/durable.ts`), which awaits `syncToFs()` after every committed transaction. All repository writes, including `deleteDay` and the migration runner, are transactions. A save resolves only after its data has been flushed.

## Consequences

- The IndexedDB fallback described in ADR 0003 is not needed.
- Each save flushes whole files (PGlite stores one blob per table or index file), which adds a few milliseconds per save.
- Browser storage can still be evicted by the browser. The app requests persistent storage and offers a JSON backup.
- This behavior is specific to the pinned version 0.5.14. Re-check it when upgrading PGlite.
- Not tested: Firefox and Safari.
