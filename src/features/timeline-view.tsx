"use client";

import type { Timeline, TimelineItem } from "./timeline.ts";
import styles from "./timeline-view.module.css";

/** Rem of width per hour of the axis; the board scrolls sideways when the screen is narrower. */
const REM_PER_HOUR = 8;

function badge(item: TimelineItem): string {
  if (item.cancelled) return "Cancelled";
  const parts: string[] = [];
  if (item.blocking > 0) parts.push(`${item.blocking} blocking`);
  if (item.warnings > 0)
    parts.push(`${item.warnings} ${item.warnings === 1 ? "warning" : "warnings"}`);
  return parts.join(", ");
}

function itemClass(item: TimelineItem, offTrack: boolean): string {
  return [
    styles.item,
    offTrack ? styles.offTrack : "",
    item.cancelled ? styles.cancelled : "",
    !item.cancelled && item.blocking > 0 ? styles.blocking : "",
    !item.cancelled && item.blocking === 0 && item.warnings > 0 ? styles.warning : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function TimelineView({
  timeline,
  onOpen,
}: {
  timeline: Timeline;
  onOpen: (sessionId: string) => void;
}) {
  const hours = (timeline.axis.endMinute - timeline.axis.startMinute) / 60;
  return (
    <section className={styles.scroller} aria-label="Day timeline, one lane per track layout">
      <div className={styles.board} style={{ minWidth: `${hours * REM_PER_HOUR + 9}rem` }}>
        <div className={styles.row}>
          <div className={styles.label} aria-hidden="true" />
          <div className={styles.axis} aria-hidden="true">
            {timeline.ticks.map((tick) => (
              <span key={tick.minute} className={styles.tick} style={{ left: `${tick.left}%` }}>
                {tick.label}
              </span>
            ))}
          </div>
        </div>

        {timeline.lanes.map((lane) => (
          <section key={lane.id} className={styles.row} aria-label={lane.name}>
            <h3 className={styles.label}>{lane.name}</h3>
            <div
              className={styles.track}
              style={{ height: `calc(${lane.rows} * var(--row-h) + 0.4rem)` }}
            >
              <div
                className={styles.hours}
                aria-hidden="true"
                style={{ left: `${timeline.hours.left}%`, width: `${timeline.hours.width}%` }}
              />
              {timeline.ticks.map((tick) => (
                <span
                  key={tick.minute}
                  className={styles.gridline}
                  aria-hidden="true"
                  style={{ left: `${tick.left}%` }}
                />
              ))}
              {lane.closures.map((band) => (
                <div
                  key={band.id}
                  className={styles.closure}
                  style={{ left: `${band.left}%`, width: `${band.width}%` }}
                  role="img"
                  aria-label={band.label}
                  title={band.label}
                >
                  <span>{band.label}</span>
                </div>
              ))}
              {lane.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={itemClass(item, lane.kind === "off-track")}
                  style={{
                    left: `${item.left}%`,
                    width: `${item.width}%`,
                    top: `calc(${item.row} * var(--row-h) + 0.2rem)`,
                  }}
                  title={item.description}
                  onClick={() => onOpen(item.id)}
                >
                  <span className={styles.title}>{item.title}</span>
                  <span className={styles.time}>{item.timeText}</span>
                  {badge(item) ? <span className={styles.badge}>{badge(item)}</span> : null}
                  <span className="visuallyHidden">
                    . {item.activityName}, {item.statusText}. Open to edit.
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
