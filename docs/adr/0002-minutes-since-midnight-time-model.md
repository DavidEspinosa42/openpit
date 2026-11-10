# 0002. Minutes since midnight as the time model

- Status: accepted
- Date: 2026-11-10

## Context

A track day is a single-venue, daytime schedule. Time zones and daylight-saving changes are a source of errors that this use case does not need.

## Decision

A day is a local calendar date string. Session times are integer minutes since midnight in half-open intervals `[start, end)` with `0 <= start < end <= 1440`, aligned to a configurable grid (default 5 minutes). No time zones. No overnight sessions.

## Consequences

- Interval math is integer arithmetic; touching intervals never overlap.
- The engine needs no date library and no clock, which keeps it deterministic.
- Overnight sessions need a later model change.
- A day with a daylight-saving change is treated as a 1440-minute day.
