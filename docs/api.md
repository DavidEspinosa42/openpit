# Engine API

The engine lives in `src/engine`, is pure TypeScript, and imports only from `src/domain`. The same code runs in the browser and in the CLI.

## `validateDay(config, day): Conflict[]`

```ts
import { validateDay } from "../engine/index.ts";
const conflicts = validateDay(workspace.config, workspace.days[0]);
```

- **Input:** a `SchoolConfig` and a `ScheduleDay`, both already parsed with the Zod schemas in `src/domain`. The engine does not validate structure; dangling references are skipped, never thrown.
- **Output:** every conflict, as data. The function never throws for a scheduling problem.
- **Purity:** no I/O, clock, randomness or locale. Inputs are not mutated.
- **Order:** a strict total order: blocking before warning, then the code order in `CONFLICT_CODES`, then the canonical `key`. String comparison is by code unit. Permuting any input array, including `vehicleIds` and `pitBoxIds`, gives an identical result.
- **Cancelled sessions** are ignored by every rule.

### `Conflict`

| Field        | Meaning                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| `code`       | One of the 13 stable codes listed in [domain.md](domain.md)                                                         |
| `severity`   | `blocking` or `warning`                                                                                             |
| `sessionIds` | Sorted IDs of every session involved                                                                                |
| `resources`  | Sorted `{ kind, id }` references: `section`, `layout`, `vehicle`, `pitBox`, `category`, `closure`, `unavailability` |
| `params`     | Numbers and strings for the message, with stable keys per code                                                      |
| `key`        | Canonical unique key, `code                                                                                         | sessions | resources | params` |

Each distinct violation appears once. The engine returns codes and parameters; the UI and CLI turn them into text.

### Parameters per code

| Code                           | `params`                                                                 |
| ------------------------------ | ------------------------------------------------------------------------ |
| `OUTSIDE_OPERATING_HOURS`      | `opensAt`, `closesAt`                                                    |
| `TRACK_SECTION_OVERLAP`        | `overlapMinutes`                                                         |
| `TRACK_CLEARANCE_TOO_SHORT`    | `gap`, `required`                                                        |
| `TRACK_CLOSED`                 | none                                                                     |
| `LAYOUT_CAPACITY_EXCEEDED`     | `count`, `capacity`                                                      |
| `CATEGORY_NOT_ALLOWED`         | none                                                                     |
| `MIXED_CATEGORIES`             | `categories` (how many were mixed)                                       |
| `VEHICLE_DOUBLE_BOOKED`        | `overlapMinutes`                                                         |
| `VEHICLE_UNAVAILABLE`          | `cause` (`status` or `window`), plus `status` when the cause is `status` |
| `VEHICLE_TURNAROUND_TOO_SHORT` | `gap`, `required`                                                        |
| `PIT_BOX_DOUBLE_BOOKED`        | `overlapMinutes`                                                         |
| `PIT_BOX_CAPACITY_EXCEEDED`    | `vehicles`, `capacity`                                                   |
| `NO_VEHICLES_ASSIGNED`         | none                                                                     |

## `hasBlocking(conflicts): boolean`

True when at least one conflict has severity `blocking`.

## `suggestSlots(config, day, sessionId, { limit? }): Suggestion[]`

Proposes up to `limit` (default 3) other start times for one session. The duration is kept and starts stay on the grid.

```ts
const options = suggestSlots(workspace.config, day, "road-b", { limit: 3 });
// [{ sessionId: "road-b", startMinute: 670, endMinute: 730, shiftMinutes: 70 }, ...]
```

- **Soundness (invariant 5):** a start is returned only when the moved session has no blocking conflict. Moving one session cannot change conflicts between other sessions, so nothing new appears elsewhere. Warnings (for example `NO_VEHICLES_ASSIGNED`) do not disqualify a start. Tests re-check this with a full `validateDay` over generated days, and check that the result matches an exhaustive search.
- **Order:** nearest to the current start first; the earlier time wins a tie. The current start is never suggested.
- **No solution:** returns `[]`. This also happens for an unknown or cancelled session, or `limit` 0.
- **Speed:** each candidate is checked against only the sessions close enough to interact with it (closer than the larger of the track clearance and the longest vehicle turnaround), then the `validateDay` rules decide. Five suggestion requests on a 200-session day finish well under a second.

## Performance

A 200-session generated day (about 3,800 conflicts, far more than a real schedule) validates in roughly 12 ms on the development machine (Node 26.13). The test suite enforces a budget of 250 ms to leave room for slow CI machines. Pair-wise rules are quadratic in the number of sessions; 1,000 sessions took about 200 ms.
