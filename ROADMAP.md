# Roadmap

Estimates are planning figures made on 2026-11-10, not commitments.

## Completed

Nothing is completed yet. The MVP is in progress; see the phases below.

## MVP (target about 65 h)

| Phase           | Deliverable                                                             | Est. | Status      |
| --------------- | ----------------------------------------------------------------------- | ---- | ----------- |
| M0 Foundations  | Repository, docs, ADRs, tooling, CI                                     | 7 h  | in progress |
| M1 Domain       | Types, Zod schemas, time utilities, reference checker, sample workspace | 7 h  | planned     |
| M2 Engine       | `validateDay` with 13 rule codes, stable ordering                       | 14 h | planned     |
| M3 CLI          | `pnpm validate`, sample generator                                       | 3 h  | planned     |
| M4 Storage      | PGlite spike, migrations, repository, single-tab lock                   | 9 h  | planned     |
| M5 Planner UI   | Session editing, conflicts panel, import/export, print view             | 16 h | planned     |
| M6 Suggestions  | Nearest conflict-free start times                                       | 4 h  | planned     |
| M7 Quality pass | Screenshots, README accuracy, cleanup, scans                            | 5 h  | planned     |

## After the MVP (planned)

| Phase                           | Scope                                                                                                                                                          | Depends on                          | Est. |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ---- |
| R1 Installable offline app      | Service worker precaching, update prompt, manifest and icons, hosted demo with base path, `docs/deployment.md`                                                 | MVP                                 | 18 h |
| R2 Resource depth               | Equipment pools, pit-box restrictions, running limits, maintenance windows, deterministic auto-assign                                                          | MVP                                 | 30 h |
| R3 Interactive planner          | Drag and resize with keyboard equivalents, templates, copy day, undo/redo, week overview                                                                       | MVP                                 | 32 h |
| R4 Rescheduling and disruptions | Closure, breakdown, delay, cancellation workflows with impact lists, ripple delay, ranked suggestions, bounded repair search, property-based tests, benchmarks | R2                                  | 40 h |
| R5 Reports and interoperability | PDF day schedule, pit allocation sheet, utilization and conflict reports, CSV, versioned file format, iCalendar                                                | R2                                  | 28 h |
| R6 Reliability and data safety  | Schedule versions with restore and diff, publish step, automatic local backups, migration harness, multi-tab support                                           | R1                                  | 30 h |
| R7 Configuration UI             | In-app config editor, normalized config tables, multiple circuits, first-run setup                                                                             | R6                                  | 26 h |
| R8 Hardening                    | Playwright journeys, WCAG 2.2 AA audit, locale and 12/24 h formats, CSP, dependency automation, browser matrix, local diagnostics file                         | R3, R5                              | 34 h |
| R9 Multi-device sync (gated)    | Self-hostable sync service, accounts and roles, read-only pit-lane view, guides                                                                                | R6, R7, evidence from a real school | 60 h |
| R10 Launch                      | Releases, changelog, user guide, contribution guide, pilot feedback loop                                                                                       | R8                                  | 16 h |

Core R1 to R8 plus R10 is about 254 h; with R9 about 314 h.

## Permanently out of scope

Student or instructor personal data, bookings and payments, live timing, official race control or safety signaling.
