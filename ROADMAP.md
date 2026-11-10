# Roadmap

Estimates are planning figures made on 2026-11-10, not commitments. The MVP estimate was about 65 hours; actual effort was not tracked.

## Completed: the MVP

| Phase           | What exists                                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M0 Foundations  | Repository, MIT license, README, contributor conventions, domain and landscape documents, architecture decision records, tooling (Next.js static export, TypeScript, Biome, Vitest), CI workflow |
| M1 Domain       | Types, Zod schemas, minute-based time utilities, reference checker, workspace parser with size limit, fictional sample workspace, seeded generator                                               |
| M2 Engine       | `validateDay` with 13 conflict rules and a stable total order, tested for determinism and for a 200-session day                                                                                  |
| M3 CLI          | `pnpm validate` (exit codes 0, 1, 2, JSON output) and `pnpm generate:sample`                                                                                                                     |
| M4 Storage      | PGlite on IndexedDB (spike confirmed, see ADR 0004), SQL migrations, repository with revisions and atomic import, single-tab Web Lock                                                            |
| M5 Planner UI   | Planner and Data screens: timeline, session dialog, conflicts panel, closures and unavailability, import and export, print stylesheet                                                            |
| M6 Suggestions  | `suggestSlots`: nearest conflict-free start times, checked for soundness against a full validation                                                                                               |
| M7 Quality pass | Screenshots from the running app, README matched to behavior, unused code removed, secret and history scan                                                                                       |

### Known limits of the MVP

- Verified in Chromium only. Firefox and Safari were not tried.
- The GitHub Actions workflow has not run on GitHub; its steps were run locally.
- Accessibility: automated audit and a hand check of the keyboard path; no full WCAG 2.2 AA audit (R8).
- The print layout was checked by applying the print rules on screen, not in a real print preview.
- Not installable and not usable offline from a cold start (R1).
- The school configuration can only be changed by editing the JSON file and importing it (R7).

## Planned after the MVP

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
