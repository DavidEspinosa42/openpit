"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import styles from "./app-shell.module.css";
import { useWorkspace } from "./workspace-provider.tsx";

const LINKS = [
  { href: "/", label: "Planner" },
  { href: "/data", label: "Data" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { status, error, clearError, config } = useWorkspace();
  const pathname = usePathname();
  const current = pathname.replace(/\/+$/, "") || "/";

  return (
    <>
      <a className="skipLink" href="#main">
        Skip to content
      </a>
      <header className={`${styles.header} noPrint`}>
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true" />
          <span className={styles.name}>OpenPit</span>
          {config ? <span className={styles.school}>{config.name}</span> : null}
        </div>
        <nav aria-label="Main">
          <ul className={styles.nav}>
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={styles.link}
                  aria-current={current === link.href ? "page" : undefined}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      {error ? (
        <div className={`${styles.banner} noPrint`} role="alert">
          <span>{error}</span>
          <button type="button" className="btn btnSmall" onClick={clearError}>
            Dismiss
          </button>
        </div>
      ) : null}

      <main id="main" className={styles.main} tabIndex={-1}>
        {status.kind === "loading" ? (
          <p role="status">Opening your local schedule…</p>
        ) : status.kind === "locked" ? (
          <section className={styles.notice} aria-labelledby="locked-title">
            <h1 id="locked-title">OpenPit is already open in another tab</h1>
            <p>
              Only one tab can edit the schedule at a time, so two tabs cannot overwrite each other.
              Close the other OpenPit tab or window, then reload this page.
            </p>
            <button
              type="button"
              className="btn btnPrimary"
              onClick={() => window.location.reload()}
            >
              Reload this page
            </button>
          </section>
        ) : status.kind === "error" ? (
          <section className={styles.notice} aria-labelledby="error-title">
            <h1 id="error-title">The local database could not be opened</h1>
            <p>{status.message}</p>
            <p>
              OpenPit keeps its data in your browser. Private windows, blocked site data, or a newer
              version of OpenPit that wrote the data can all prevent this. Reload the page to try
              again.
            </p>
          </section>
        ) : (
          children
        )}
      </main>
    </>
  );
}
