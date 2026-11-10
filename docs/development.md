# Development

## Requirements

- Node.js 26.13.0 or newer (the `engines` field enforces this)
- pnpm 12.16.1 (pinned in `packageManager`)

## Commands

```
pnpm install --frozen-lockfile
pnpm typecheck        # tsc --noEmit (TypeScript 7)
pnpm lint             # biome check .
pnpm format           # biome check --write .
pnpm test             # vitest run
pnpm build            # next build, static export to out/
pnpm dev              # next dev
```

Scripts run with Node's native TypeScript support, so imports inside `src` and `scripts` use explicit `.ts` extensions and only erasable syntax (no enums or constructor parameter properties).

## CLI

### Validate a workspace file

```
pnpm validate <file> [--date YYYY-MM-DD] [--json]
```

| Exit code | Meaning                                                                                 |
| --------- | --------------------------------------------------------------------------------------- |
| 0         | No blocking conflicts (warnings may exist)                                              |
| 1         | At least one blocking conflict                                                          |
| 2         | Invalid input: unreadable file, invalid JSON, schema or reference errors, bad arguments |

`--json` prints a machine-readable report on standard output, also for invalid input. Without `--date` every day in the file is checked.

### Generate synthetic data

```
pnpm generate:sample [--config file] [--seed N] [--days N] [--sessions N] [--start YYYY-MM-DD] [--out file]
```

Reuses the school configuration of an existing workspace file (default: the fictional sample) and adds seeded random days. The same arguments always produce the same output. Random days contain many conflicts by design.

## The fictional sample

`data/samples/fictional-ridge.json` describes a fictional school, "Fictional Ridge Driving School", with one day, 2026-06-13. Every name is invented. `pnpm validate data/samples/fictional-ridge.json` reports 14 blocking conflicts and 1 warning, each caused on purpose:

| Code                             | Cause in the sample                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| `OUTSIDE_OPERATING_HOURS`        | "Evening lapping" ends at 18:20, after closing at 18:00                             |
| `TRACK_SECTION_OVERLAP`          | "Race car practice" (full circuit) and "South loop drill" overlap in the south loop |
| `TRACK_CLEARANCE_TOO_SHORT`      | Two pairs of back-to-back sessions share sections with no gap                       |
| `TRACK_CLOSED`                   | "Afternoon short circuit" runs while the north loop is closed                       |
| `LAYOUT_CAPACITY_EXCEEDED`       | A kart on the south loop, which has no kart capacity                                |
| `CATEGORY_NOT_ALLOWED`           | A kart in a road and race car practice session                                      |
| `MIXED_CATEGORIES`               | "Mixed practice" mixes road and race cars                                           |
| `VEHICLE_DOUBLE_BOOKED`          | Road car 2 is in two overlapping preparation sessions                               |
| `VEHICLE_UNAVAILABLE`            | Road car 5 is in maintenance; Kart 2 has a tire-change window                       |
| `VEHICLE_TURNAROUND_TOO_SHORT`   | Road car 1 runs back to back                                                        |
| `PIT_BOX_DOUBLE_BOOKED`          | Two sessions use Pit box 2 at once                                                  |
| `PIT_BOX_CAPACITY_EXCEEDED`      | Three vehicles in Pit box 3, which holds two                                        |
| `NO_VEHICLES_ASSIGNED` (warning) | "Open kart track" has no vehicles                                                   |

A cancelled session in the sample overlaps others and is correctly ignored.

## Tests

Tests live in `tests/` and run in Node. They cover time math, schema accept/reject cases, every conflict rule (one positive and one negative case), touching intervals, shuffled-input determinism, a 200-session performance budget, the CLI exit codes and JSON output, and the engine import restriction.

The engine isolation rule is enforced twice: a Biome `noRestrictedImports` override for `src/engine/**` and `tests/engine-isolation.test.ts`.

## Dependency policy

Direct dependencies are pinned exactly (`savePrefix: ''`), `pnpm-lock.yaml` is committed, `minimumReleaseAge` is 10080 minutes (7 days), build scripts of dependencies are reviewed through `allowBuilds`, and CI installs with `--frozen-lockfile`.

## Manual walkthrough

Automated tests cover the logic; the screens are checked by hand. Run `pnpm build`, serve the `out` folder with any static file server (for example `npx serve out`), and open it in a Chromium-based browser. This walkthrough was run against the production build on 2026-11-10 with the fictional sample, using scripted browser actions.

1. Open `/`. With a fresh profile the planner offers "Load the fictional sample school". Choose it. The header shows the school name, the timeline shows five lanes, and the conflicts panel reports 14 blocking conflicts and 1 warning, the same as `pnpm validate`.
2. Open "Road practice B" from the timeline. The dialog lists two conflicts for the session (track clearance and vehicle turnaround). Press "Suggest a time". The first suggestion is 10:15-11:15 (10 minutes of clearance would allow 10:10, but the vehicle needs a 15-minute turnaround). Press "Use 10:15-11:15": the preview shows no conflicts. Press "Save session". The dialog closes and the panel reports 12 blocking conflicts.
3. Reload the page. The session is still at 10:15-11:15 and the panel still reports 12 blocking conflicts.
4. In "Adjustments for the day", close "Main straight" from 09:00 to 10:00. "Road practice A" gets a "Track section closed" conflict. Enter `9am` as the start: the form shows an error instead of saving. Remove the closure again.
5. Press Tab until a session on the timeline has focus, then Enter: the dialog opens with focus inside it. Press Escape: the dialog closes and focus returns to the same session.
6. Open a second tab on the same address. It shows "OpenPit is already open in another tab".
7. On `/data`, export a backup: the file has `formatVersion` 1 and the saved change. Import a file with `{"formatVersion":1,"config":{"name":"x"},"days":[]}`: it is rejected with a list of problems and the stored data is unchanged.
8. In the planner, press "Print day schedule" and check the print preview: the header, timeline and forms are hidden; the schedule table lists each session with its conflicts in text.

Step 8 was not exercised in a real print preview; the print rules are in `globals.css` and `planner.module.css`.

## Accessibility checks

Lighthouse (Chrome DevTools, desktop and mobile, snapshot mode) scored the planner 100 for accessibility on 2026-11-10 after one fix (accessible names of timeline items must contain their visible text). That is an automated check and covers only part of WCAG 2.2 AA; a full audit is planned for roadmap phase R8. Keyboard operation of the session dialog was checked by hand as in step 5. Conflicts are shown with text, a striped or dashed border and a count, not by colour alone.
