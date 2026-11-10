# Security and privacy

OpenPit is a local-first, static web app. This page states what it does and does not protect, and what was verified.

## What it holds

- The school configuration and the schedule days, in IndexedDB in the user's browser, through PGlite.
- No accounts, credentials, tokens or secrets.
- No personal data by design. The schema has no person fields. A session carries a free-text label, and the form tells users not to enter personal data. Schemas are strict, so an import with extra fields such as `instructorName` is rejected.

## What it does not do

- No server, no API routes, no analytics, no telemetry.
- No network requests at runtime other than loading its own static files. Verified on 2026-11-10 by loading the planner from the static export in Chromium and listing every resource request: 24 requests, all to the same origin as the page. This was a one-time check, not an automated test.

## Trust boundaries and how they are handled

| Input                        | Handling                                                                                                                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Imported JSON file (browser) | Size limit of 5 MiB checked before reading, JSON syntax, strict Zod schema with `formatVersion`, then reference and integrity checks. All of it runs before the first write. The write is one transaction. |
| CLI input file               | The same parser and size limit. Exit code 2 for invalid input.                                                                                                                                             |
| Rows read from the database  | Parsed with Zod before use.                                                                                                                                                                                |
| Text shown in the UI         | Rendered by React as text. The app never uses `dangerouslySetInnerHTML`.                                                                                                                                   |
| Exported files               | Plain JSON produced from validated data.                                                                                                                                                                   |

## Data durability

- The app asks the browser for persistent storage (`navigator.storage.persist()`) and shows whether it was granted.
- Browsers can still evict site data, for example when storage is low or when the user clears browsing data. The Data page offers a full JSON backup. Users should export regularly.
- Only one tab may write at a time (Web Locks API). The tab that cannot take the lock shows a notice.

## Supply chain

- Direct dependencies are pinned exactly and the lockfile is committed.
- `minimumReleaseAge` is 7 days, so freshly published versions are not installed.
- No dependency in the lockfile declares an install or build script (checked 2026-11-10: no `requiresBuild` entries), and `allowBuilds` in `pnpm-workspace.yaml` is empty. A new dependency that needs a build script must be reviewed and added there.
- CI installs with `--frozen-lockfile`, runs with read-only permissions, and pins every action to a commit SHA.
- The sample data and tests contain only fictional data.

## Known gaps

- There is no Content Security Policy yet; it is planned for roadmap phase R8.
- The static export has no integrity protection beyond the host's HTTPS. Anyone who can change the hosted files can change the app.
- Automated accessibility and security scanning is limited to the checks described in [development.md](development.md).

## Reporting a problem

Open an issue in the project repository. Do not include real personal data in reports.
