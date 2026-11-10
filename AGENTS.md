# AGENTS.md

Guidance for anyone (human or tool) changing this repository.

## What this is

OpenPit is a local-first web app that plans one day of track operations for a racing school and reports scheduling conflicts. Read `docs/domain.md` before touching rules.

## Commands

```
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm dev
pnpm validate <file> [--date YYYY-MM-DD] [--json]
pnpm generate:sample
```

## Architecture rules

- `src/domain`: types, Zod schemas, time utilities, reference checks. Depends on nothing else in `src`.
- `src/engine`: pure TypeScript. Imports only from `src/domain`. No React, no Next, no storage, no clock, no randomness, no locale.
- `src/storage`: PGlite persistence behind a repository interface. Imports `src/domain`.
- `src/features` and `src/app`: React UI. May use the engine and storage.
- `scripts`: Node CLIs. May use `src/domain` and `src/engine` only.
- Relative imports use explicit `.ts` extensions so Node, Next and Vitest resolve them the same way.

## Conventions

- Conflicts are data. Never throw for a scheduling conflict.
- No personal data in the schema, samples, tests or screenshots. Sample names must be fictional.
- Times are integer minutes since midnight, half-open intervals.
- Dependencies are pinned exactly. Add a dependency only with a stated reason.
- Commits use Conventional Commit subjects, one concern each. Run `pnpm typecheck`, `pnpm lint` and `pnpm test` before committing.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
