# OpenPit

A configurable, local-first web app that helps racing schools plan a day of track operations and catch scheduling conflicts before they reach the pit lane.

**Status:** MVP in development. See [ROADMAP.md](ROADMAP.md) for what is implemented and what is planned.

## What it does

An operations coordinator builds one day's track schedule, assigns vehicles and pit boxes, and sees every conflict (overlaps, capacity, availability, turnaround) immediately. A deterministic rule engine explains each conflict and proposes the nearest conflict-free start time. Everything runs in the browser; there is no server and no personal data.

## Documentation

- [docs/domain.md](docs/domain.md): entities, invariants and conflict rules (rule defaults are labeled assumptions)
- [docs/landscape.md](docs/landscape.md): survey of existing tools
- [docs/adr](docs/adr): architecture decision records
- [ROADMAP.md](ROADMAP.md): completed and planned work
- [AGENTS.md](AGENTS.md): conventions for contributors

## Ownership

This is a 100% independent, personal side project. It is not related to, sponsored by, or developed for any employer or client.

## License

Copyright (c) 2026 David Espinosa. MIT license, see LICENSE.
