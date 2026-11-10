# Domain

OpenPit models one day of track operations at a racing or performance-driving school.

> **Labeled assumptions.** The owner has no contact at a racing school. Every rule default below (clearance, turnaround, capacities, which sessions are subject to operating hours) is a **product assumption**, not a verified industry fact. Values live in the school configuration so a real school can change them.

## Entities

| Entity                | Meaning                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| Circuit               | The one circuit of a workspace: sections, layouts, operating hours, clearance                                |
| TrackSection          | A named stretch of track that can be closed or occupied                                                      |
| TrackLayout           | A set of sections driven together, with a vehicle capacity per category                                      |
| OperatingHours        | One daily window `[start, end)` in minutes since midnight                                                    |
| VehicleCategory       | A class of vehicles with a turnaround time in minutes                                                        |
| Vehicle               | A vehicle with a category and a status (`available`, `maintenance`, `retired`)                               |
| ActivityType          | A kind of activity: uses the track or not, allowed categories, whether categories may mix                    |
| PitBox                | A pit box with a vehicle capacity                                                                            |
| ScheduleDay           | A calendar date, a revision counter and its sessions, closures and unavailability windows                    |
| Session               | An activity in a time block, on a layout (track activities) or none (off-track), with vehicles and pit boxes |
| TrackClosure          | A section closed for a time window                                                                           |
| VehicleUnavailability | A vehicle unavailable for a time window                                                                      |
| Conflict              | A rule violation reported by the engine                                                                      |
| Suggestion            | A proposed start time for one session                                                                        |

There are no person fields. A session carries a free-text `label` only (invariant 6).

## Invariants

1. **Time model.** A day is a local calendar date `YYYY-MM-DD`. Times are integer minutes since midnight. Intervals are half-open `[start, end)` with `0 <= start < end <= 1440`, aligned to a configurable grid (default 5 minutes). No time zones, no overnight sessions.
2. **Determinism.** `validateDay(config, day)` is pure: no I/O, clock, randomness or locale. Output has a total order and does not depend on input array order.
3. **Conflicts are data.** Storage accepts a conflicted schedule. Only structural integrity is enforced: schema, references, `end > start`.
4. **Reported once.** Each conflict has a stable code, a severity and the IDs of every session and resource involved.
5. **Sound suggestions.** Applying a suggestion yields no blocking conflict for that session and adds none elsewhere; this is re-checked by `validateDay`.
6. **No personal data.**
7. **Single writer.** One browser tab owns the database; every save is one transaction and bumps the day's revision.
8. **All-or-nothing import.** Validation finishes before any write.
9. **Engine isolation.** `src/engine` imports only from `src/domain`.

## Conflict rules

Cancelled sessions are ignored by every rule. "Track session" means an activity type with `usesTrack: true`. Two intervals _overlap_ when `a.start < b.end && b.start < a.end`; touching intervals do not overlap. The _gap_ between two non-overlapping intervals is `later.start - earlier.end`.

| Code                           | Severity | Fires when                                                                                           | Assumption                                                         |
| ------------------------------ | -------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `OUTSIDE_OPERATING_HOURS`      | blocking | a track session is not fully inside the operating hours                                              | Off-track work (e.g. preparation) may happen outside opening hours |
| `TRACK_SECTION_OVERLAP`        | blocking | two track sessions overlap in time and their layouts share at least one section                      | Same layout shares all its sections                                |
| `TRACK_CLEARANCE_TOO_SHORT`    | blocking | two non-overlapping track sessions share a section and the gap is below `circuit.clearanceMinutes`   | Default 10 minutes in the sample; `0` disables the rule            |
| `TRACK_CLOSED`                 | blocking | a track session overlaps a closure of a section in its layout                                        |                                                                    |
| `LAYOUT_CAPACITY_EXCEEDED`     | blocking | assigned vehicles of a category exceed the layout capacity for that category (missing entry means 0) | One conflict per session and category                              |
| `CATEGORY_NOT_ALLOWED`         | blocking | a vehicle's category is not allowed for the activity type                                            | One conflict per session and vehicle                               |
| `MIXED_CATEGORIES`             | blocking | the activity type forbids mixing and the vehicles span more than one category                        |                                                                    |
| `VEHICLE_DOUBLE_BOOKED`        | blocking | a vehicle is in two overlapping sessions                                                             | One conflict per session pair and vehicle                          |
| `VEHICLE_UNAVAILABLE`          | blocking | a vehicle's status is not `available`, or its session overlaps an unavailability window              | One conflict per session, vehicle and cause                        |
| `VEHICLE_TURNAROUND_TOO_SHORT` | blocking | a vehicle is in two non-overlapping sessions and the gap is below the category turnaround            | `turnaroundMinutes` of the vehicle's category                      |
| `PIT_BOX_DOUBLE_BOOKED`        | blocking | two overlapping sessions use the same pit box                                                        | A pit box serves one session at a time                             |
| `PIT_BOX_CAPACITY_EXCEEDED`    | blocking | a session assigns pit boxes and has more vehicles than their combined capacity                       | Not evaluated when no pit box is assigned                          |
| `NO_VEHICLES_ASSIGNED`         | warning  | a planned session has no vehicles                                                                    |                                                                    |

That is 13 codes: 12 blocking and 1 warning.

## Ordering

Conflicts are sorted by severity (blocking first), then code order as listed above, then a canonical key built from the sorted session IDs, resource IDs and parameters. Comparison uses plain code-unit string comparison, never locale-aware comparison.

## Suggestions

`suggestSlots` tries every grid-aligned start time that keeps the session duration inside the day, ranks them by distance from the current start (earlier first on ties), and returns up to N starts that pass `validateDay` as defined in invariant 5. It may return an empty list.

## Out of scope

Student or instructor personal data, bookings and payments, live timing, official race control or safety signaling.
