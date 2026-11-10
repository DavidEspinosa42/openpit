"use client";

import {
  CONFLICT_TITLES,
  type Conflict,
  formatConflict,
  type MessageLookup,
} from "../domain/index.ts";
import styles from "./conflicts-panel.module.css";
import { conflictCounts } from "./timeline.ts";

function ConflictItem({
  conflict,
  lookup,
  onOpen,
}: {
  conflict: Conflict;
  lookup: MessageLookup;
  onOpen: (sessionId: string) => void;
}) {
  const blocking = conflict.severity === "blocking";
  return (
    <li className={`${styles.item} ${blocking ? styles.blocking : styles.warning}`}>
      <p className={styles.title}>
        <span className={styles.tag}>{blocking ? "Blocking" : "Warning"}</span>
        {CONFLICT_TITLES[conflict.code]}
      </p>
      <p className={styles.message}>{formatConflict(conflict, lookup)}</p>
      <div className={styles.actions}>
        {conflict.sessionIds.map((id) => (
          <button key={id} type="button" className="btn btnSmall" onClick={() => onOpen(id)}>
            Edit {lookup.sessionLabel(id)}
          </button>
        ))}
      </div>
    </li>
  );
}

export function ConflictsPanel({
  conflicts,
  lookup,
  onOpen,
}: {
  conflicts: readonly Conflict[];
  lookup: MessageLookup;
  onOpen: (sessionId: string) => void;
}) {
  const counts = conflictCounts(conflicts);
  const blocking = conflicts.filter((c) => c.severity === "blocking");
  const warnings = conflicts.filter((c) => c.severity === "warning");

  return (
    <aside className={styles.panel} aria-labelledby="conflicts-title">
      <h2 id="conflicts-title">Conflicts</h2>
      <p className={styles.summary} role="status">
        {counts.blocking === 0 && counts.warning === 0
          ? "No conflicts. Every session fits the rules for this day."
          : `${counts.blocking} blocking, ${counts.warning} ${counts.warning === 1 ? "warning" : "warnings"}`}
      </p>

      {blocking.length > 0 ? (
        <section aria-label="Blocking conflicts">
          <h3>Blocking ({blocking.length})</h3>
          <ul className={styles.list}>
            {blocking.map((c) => (
              <ConflictItem key={c.key} conflict={c} lookup={lookup} onOpen={onOpen} />
            ))}
          </ul>
        </section>
      ) : null}

      {warnings.length > 0 ? (
        <section aria-label="Warnings">
          <h3>Warnings ({warnings.length})</h3>
          <ul className={styles.list}>
            {warnings.map((c) => (
              <ConflictItem key={c.key} conflict={c} lookup={lookup} onOpen={onOpen} />
            ))}
          </ul>
        </section>
      ) : null}
    </aside>
  );
}
