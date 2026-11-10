"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createLookup } from "../domain/index.ts";
import { Adjustments } from "./adjustments.tsx";
import { ConflictsPanel } from "./conflicts-panel.tsx";
import {
  draftFromSession,
  newDraft,
  removeSession,
  type SessionDraft,
  setSessionStatus,
  upsertSession,
} from "./edit.ts";
import styles from "./planner.module.css";
import { SessionDialog } from "./session-dialog.tsx";
import { buildScheduleRows, buildTimeline, conflictCounts } from "./timeline.ts";
import { TimelineView } from "./timeline-view.tsx";
import { useWorkspace } from "./workspace-provider.tsx";

function formatLongDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function AddDayForm({
  onAdd,
  label,
}: {
  onAdd: (date: string) => Promise<boolean>;
  label: string;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className={styles.addDay}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!value) return;
        setBusy(true);
        const added = await onAdd(value);
        setBusy(false);
        if (added) setValue("");
      }}
    >
      <div className="field">
        <label htmlFor="new-day">New day</label>
        <input
          id="new-day"
          type="date"
          className="input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <button type="submit" className="btn" disabled={!value || busy}>
        {label}
      </button>
    </form>
  );
}

export function Planner() {
  const ws = useWorkspace();
  const [editing, setEditing] = useState<{ draft: SessionDraft; isNew: boolean } | null>(null);

  const { config, day, conflicts } = ws;
  const timeline = useMemo(
    () => (config && day ? buildTimeline(config, day, conflicts) : null),
    [config, day, conflicts],
  );
  const rows = useMemo(
    () => (config && day ? buildScheduleRows(config, day, conflicts) : []),
    [config, day, conflicts],
  );
  const lookup = useMemo(() => (config && day ? createLookup(config, day) : null), [config, day]);

  if (!config) {
    return (
      <section className={styles.empty} aria-labelledby="empty-title">
        <h1 id="empty-title">No school loaded yet</h1>
        <p>
          OpenPit plans one day of track operations from a school configuration: the circuit, track
          layouts, vehicles, activities and pit boxes. Load the fictional example to try the
          planner, or import your own workspace file.
        </p>
        <div className={styles.emptyActions}>
          <button type="button" className="btn btnPrimary" onClick={() => void ws.loadSample()}>
            Load the fictional sample school
          </button>
          <Link className="btn" href="/data">
            Import a file
          </Link>
        </div>
      </section>
    );
  }

  if (!day || !timeline || !lookup) {
    return (
      <section className={styles.empty} aria-labelledby="empty-title">
        <h1 id="empty-title">No days planned yet</h1>
        <p>Pick the date you want to plan. Everything you enter is saved on this device.</p>
        <AddDayForm label="Add day" onAdd={ws.createDay} />
      </section>
    );
  }

  const counts = conflictCounts(conflicts);
  const planned = day.sessions.filter((s) => s.status === "planned").length;
  const cancelled = day.sessions.length - planned;

  const open = (sessionId: string) => {
    const session = day.sessions.find((s) => s.id === sessionId);
    if (session) setEditing({ draft: draftFromSession(session), isNew: false });
  };

  return (
    <div className={styles.page}>
      <p className={styles.printTitle} aria-hidden="true">
        {config.name}
      </p>

      <section className={`${styles.dayBar} noPrint`} aria-label="Day">
        <div className="field">
          <label htmlFor="day-select">Day</label>
          <select
            id="day-select"
            className="select"
            value={day.date}
            onChange={(e) => ws.selectDate(e.target.value)}
          >
            {ws.dates.map((date) => (
              <option key={date} value={date}>
                {date}
              </option>
            ))}
          </select>
        </div>
        <AddDayForm label="Add day" onAdd={ws.createDay} />
        <div className={styles.dayActions}>
          <button
            type="button"
            className="btn btnPrimary"
            onClick={() => setEditing({ draft: newDraft(config, day), isNew: true })}
          >
            New session
          </button>
          <button type="button" className="btn" onClick={() => window.print()}>
            Print day schedule
          </button>
          <button
            type="button"
            className="btn btnDanger"
            onClick={() => {
              if (window.confirm(`Delete the whole day ${day.date} and all its sessions?`)) {
                void ws.deleteDay();
              }
            }}
          >
            Delete day
          </button>
        </div>
      </section>

      <div className={styles.heading}>
        <h1>{formatLongDate(day.date)}</h1>
        <p className={styles.summary}>
          {planned} {planned === 1 ? "session" : "sessions"} planned
          {cancelled > 0 ? `, ${cancelled} cancelled` : ""}. {counts.blocking} blocking{" "}
          {counts.blocking === 1 ? "conflict" : "conflicts"}, {counts.warning}{" "}
          {counts.warning === 1 ? "warning" : "warnings"}.
        </p>
      </div>

      <div className={styles.layout}>
        <div className={styles.mainColumn}>
          <section className="noPrint" aria-labelledby="timeline-title">
            <h2 id="timeline-title" className="visuallyHidden">
              Timeline
            </h2>
            <TimelineView timeline={timeline} onOpen={open} />
            {day.sessions.length === 0 ? (
              <p className={styles.hintLine}>
                The day is empty. Use New session to add the first block of track time.
              </p>
            ) : null}
          </section>

          <section aria-labelledby="schedule-title" className={styles.schedule}>
            <h2 id="schedule-title">Day schedule</h2>
            {rows.length === 0 ? (
              <p className="hint">No sessions yet.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Time</th>
                      <th scope="col">Session</th>
                      <th scope="col">Layout</th>
                      <th scope="col">Vehicles</th>
                      <th scope="col">Pit boxes</th>
                      <th scope="col">Conflicts</th>
                      <th scope="col" className="noPrint">
                        <span className="visuallyHidden">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.id}
                        className={row.status === "cancelled" ? styles.cancelledRow : undefined}
                      >
                        <td className="num">{row.time}</td>
                        <th scope="row">
                          {row.title}
                          <span className={styles.sub}>
                            {row.activity}
                            {row.status === "cancelled" ? ", cancelled" : ""}
                          </span>
                        </th>
                        <td>{row.layout}</td>
                        <td>{row.vehicles || <span className="hint">None</span>}</td>
                        <td>{row.pitBoxes || <span className="hint">None</span>}</td>
                        <td>
                          {row.status === "cancelled" ? (
                            <span className="hint">Ignored (cancelled)</span>
                          ) : row.messages.length === 0 ? (
                            "None"
                          ) : (
                            <ul className={styles.messages}>
                              {row.messages.map((message) => (
                                <li key={message}>{message}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="noPrint">
                          <button
                            type="button"
                            className="btn btnSmall"
                            aria-label={`Edit ${row.title} at ${row.time}`}
                            onClick={() => open(row.id)}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="noPrint">
            <Adjustments config={config} day={day} onEdit={ws.editDay} />
          </div>
        </div>

        <div className={`${styles.sideColumn} noPrint`}>
          <ConflictsPanel conflicts={conflicts} lookup={lookup} onOpen={open} />
        </div>
      </div>

      {editing ? (
        <SessionDialog
          key={editing.draft.id}
          config={config}
          day={day}
          initial={editing.draft}
          isNew={editing.isNew}
          onSave={(session) => ws.editDay((d) => upsertSession(d, session))}
          onSetStatus={(status) => ws.editDay((d) => setSessionStatus(d, editing.draft.id, status))}
          onDelete={() => ws.editDay((d) => removeSession(d, editing.draft.id))}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
