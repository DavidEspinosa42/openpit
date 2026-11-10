# 0001. Static export, no backend, Next.js kept

- Status: accepted
- Date: 2026-11-10

## Context

OpenPit is used by one person planning one day, holds no personal data and should work without anything to operate. The owner's stated stack is Next.js and TypeScript.

## Decision

Build a Next.js App Router app with `output: 'export'`, producing static files. No server, no API routes, no authentication, no runtime network calls. Keep Next.js even though a Vite single-page app would be leaner.

## Consequences

- Nothing to host except static files; no data leaves the browser.
- No multi-device sharing until roadmap phase R9.
- Some unused framework surface remains. Server features stay possible for R9.
- Features that need a server (rewrites, middleware, route handlers, image optimization) cannot be used.
