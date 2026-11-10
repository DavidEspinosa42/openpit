import {
  type Conflict,
  createLookup,
  formatConflict,
  formatMinute,
  MINUTES_PER_DAY,
  type ScheduleDay,
  type SchoolConfig,
} from "../domain/index.ts";

/**
 * View model for the day timeline and the schedule table: where each session sits in its lane,
 * how many conflicts it has, and the text for screen readers. Pure functions, no React.
 */

export interface AxisRange {
  readonly startMinute: number;
  readonly endMinute: number;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Visible time range: the operating hours with an hour of margin, widened to include every
 * session and closure, snapped to whole hours and kept inside the day.
 */
export function axisRange(config: SchoolConfig, day: ScheduleDay): AxisRange {
  const hours = config.circuit.operatingHours;
  let start = hours.startMinute - 60;
  let end = hours.endMinute + 60;
  for (const block of [...day.sessions, ...day.closures, ...day.unavailabilities]) {
    start = Math.min(start, block.startMinute);
    end = Math.max(end, block.endMinute);
  }
  start = Math.max(0, Math.floor(start / 60) * 60);
  end = Math.min(MINUTES_PER_DAY, Math.ceil(end / 60) * 60);
  if (end - start < 120) end = Math.min(MINUTES_PER_DAY, start + 120);
  return { startMinute: start, endMinute: end };
}

/** Position of a minute inside the axis as a percentage, rounded to three decimals. */
export function toPercent(minute: number, axis: AxisRange): number {
  const span = axis.endMinute - axis.startMinute;
  const value = ((minute - axis.startMinute) / span) * 100;
  return Math.round(value * 1000) / 1000;
}

/**
 * Greedy interval packing: overlapping blocks get different rows, touching blocks may share one.
 * Deterministic: blocks are ordered by start, end, then id.
 */
export function packRows(
  blocks: readonly { id: string; startMinute: number; endMinute: number }[],
): Map<string, number> {
  const ordered = [...blocks].sort(
    (a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute || compareText(a.id, b.id),
  );
  const rowEnds: number[] = [];
  const rows = new Map<string, number>();
  for (const block of ordered) {
    let row = rowEnds.findIndex((end) => end <= block.startMinute);
    if (row === -1) {
      row = rowEnds.length;
      rowEnds.push(block.endMinute);
    } else {
      rowEnds[row] = block.endMinute;
    }
    rows.set(block.id, row);
  }
  return rows;
}

export function conflictCounts(conflicts: readonly Conflict[]): {
  blocking: number;
  warning: number;
} {
  let blocking = 0;
  let warning = 0;
  for (const c of conflicts) {
    if (c.severity === "blocking") blocking++;
    else warning++;
  }
  return { blocking, warning };
}

export function conflictsBySession(conflicts: readonly Conflict[]): Map<string, Conflict[]> {
  const map = new Map<string, Conflict[]>();
  for (const conflict of conflicts) {
    for (const id of conflict.sessionIds) {
      const list = map.get(id) ?? [];
      list.push(conflict);
      map.set(id, list);
    }
  }
  return map;
}

export interface TimelineItem {
  readonly id: string;
  readonly title: string;
  readonly activityName: string;
  readonly timeText: string;
  readonly left: number;
  readonly width: number;
  readonly row: number;
  readonly cancelled: boolean;
  readonly blocking: number;
  readonly warnings: number;
  /** Conflict status in words, for example "2 blocking conflicts" or "no conflicts". */
  readonly statusText: string;
  /** Full text for the tooltip. */
  readonly description: string;
}

export interface TimelineBand {
  readonly id: string;
  readonly label: string;
  readonly left: number;
  readonly width: number;
}

export interface TimelineLane {
  readonly id: string;
  readonly name: string;
  readonly kind: "layout" | "off-track";
  readonly rows: number;
  readonly items: readonly TimelineItem[];
  readonly closures: readonly TimelineBand[];
}

export interface TimelineTick {
  readonly minute: number;
  readonly left: number;
  readonly label: string;
}

export interface Timeline {
  readonly axis: AxisRange;
  readonly ticks: readonly TimelineTick[];
  /** Operating hours as a band over the lanes. */
  readonly hours: { readonly left: number; readonly width: number };
  readonly lanes: readonly TimelineLane[];
}

export const OFF_TRACK_LANE_ID = "off-track";

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function buildTimeline(
  config: SchoolConfig,
  day: ScheduleDay,
  conflicts: readonly Conflict[],
): Timeline {
  const axis = axisRange(config, day);
  const lookup = createLookup(config, day);
  const bySession = conflictsBySession(conflicts);
  const activities = new Map(config.activityTypes.map((a) => [a.id, a.name]));
  const layoutIds = new Set(config.circuit.layouts.map((l) => l.id));

  const ticks: TimelineTick[] = [];
  for (let minute = axis.startMinute; minute <= axis.endMinute; minute += 60) {
    ticks.push({ minute, left: toPercent(minute, axis), label: formatMinute(minute) });
  }

  const hours = config.circuit.operatingHours;
  const hoursBand = {
    left: toPercent(hours.startMinute, axis),
    width: toPercent(hours.endMinute, axis) - toPercent(hours.startMinute, axis),
  };

  const laneFor = (sessionLayoutId: string | null) =>
    sessionLayoutId !== null && layoutIds.has(sessionLayoutId)
      ? sessionLayoutId
      : OFF_TRACK_LANE_ID;

  const lanes: TimelineLane[] = [];
  const laneDefs: {
    id: string;
    name: string;
    kind: "layout" | "off-track";
    sectionIds: string[];
  }[] = [
    ...config.circuit.layouts.map((l) => ({
      id: l.id,
      name: l.name,
      kind: "layout" as const,
      sectionIds: l.sectionIds,
    })),
    { id: OFF_TRACK_LANE_ID, name: "Off-track", kind: "off-track" as const, sectionIds: [] },
  ];

  for (const def of laneDefs) {
    const sessions = day.sessions.filter((s) => laneFor(s.layoutId) === def.id);
    const rows = packRows(sessions);
    const items: TimelineItem[] = sessions
      .map((session) => {
        const own = bySession.get(session.id) ?? [];
        const counts =
          session.status === "cancelled" ? { blocking: 0, warning: 0 } : conflictCounts(own);
        const activityName = activities.get(session.activityTypeId) ?? session.activityTypeId;
        const title = session.label || activityName;
        const timeText = `${formatMinute(session.startMinute)}-${formatMinute(session.endMinute)}`;
        const status =
          session.status === "cancelled"
            ? "cancelled"
            : counts.blocking + counts.warning === 0
              ? "no conflicts"
              : [
                  counts.blocking > 0 ? plural(counts.blocking, "blocking conflict") : "",
                  counts.warning > 0 ? plural(counts.warning, "warning") : "",
                ]
                  .filter(Boolean)
                  .join(", ");
        return {
          id: session.id,
          title,
          activityName,
          timeText,
          left: toPercent(session.startMinute, axis),
          width: toPercent(session.endMinute, axis) - toPercent(session.startMinute, axis),
          row: rows.get(session.id) ?? 0,
          cancelled: session.status === "cancelled",
          blocking: counts.blocking,
          warnings: counts.warning,
          statusText: status,
          description: `${title}, ${activityName}, ${timeText}, ${status}`,
        };
      })
      .sort((a, b) => a.left - b.left || compareText(a.id, b.id));

    const closures: TimelineBand[] = day.closures
      .filter((c) => def.sectionIds.includes(c.sectionId))
      .map((c) => ({
        id: c.id,
        label: `Closed: ${lookup.sectionName(c.sectionId)}${c.reason ? ` (${c.reason})` : ""}`,
        left: toPercent(c.startMinute, axis),
        width: toPercent(c.endMinute, axis) - toPercent(c.startMinute, axis),
      }));

    // Layout lanes are always shown; the off-track lane only when it has something to show.
    if (def.kind === "layout" || items.length > 0) {
      lanes.push({
        id: def.id,
        name: def.name,
        kind: def.kind,
        rows: Math.max(1, ...items.map((i) => i.row + 1)),
        items,
        closures,
      });
    }
  }

  return { axis, ticks, hours: hoursBand, lanes };
}

// ---------------------------------------------------------------------------------------
// Schedule table (also used by the print view)
// ---------------------------------------------------------------------------------------

export interface ScheduleRow {
  readonly id: string;
  readonly time: string;
  readonly title: string;
  readonly activity: string;
  readonly layout: string;
  readonly vehicles: string;
  readonly pitBoxes: string;
  readonly status: "planned" | "cancelled";
  readonly blocking: number;
  readonly warnings: number;
  /** Text of every conflict that involves this session. */
  readonly messages: readonly string[];
}

export function buildScheduleRows(
  config: SchoolConfig,
  day: ScheduleDay,
  conflicts: readonly Conflict[],
): ScheduleRow[] {
  const lookup = createLookup(config, day);
  const bySession = conflictsBySession(conflicts);
  const activities = new Map(config.activityTypes.map((a) => [a.id, a.name]));
  return [...day.sessions]
    .sort(
      (a, b) =>
        a.startMinute - b.startMinute || a.endMinute - b.endMinute || compareText(a.id, b.id),
    )
    .map((session) => {
      const own = session.status === "cancelled" ? [] : (bySession.get(session.id) ?? []);
      const counts = conflictCounts(own);
      return {
        id: session.id,
        time: `${formatMinute(session.startMinute)}-${formatMinute(session.endMinute)}`,
        title: session.label || (activities.get(session.activityTypeId) ?? session.activityTypeId),
        activity: activities.get(session.activityTypeId) ?? session.activityTypeId,
        layout: session.layoutId ? lookup.layoutName(session.layoutId) : "Off-track",
        vehicles: session.vehicleIds.map(lookup.vehicleName).join(", "),
        pitBoxes: session.pitBoxIds.map(lookup.pitBoxName).join(", "),
        status: session.status,
        blocking: counts.blocking,
        warnings: counts.warning,
        messages: own.map(
          (c) =>
            `${c.severity === "blocking" ? "Blocking" : "Warning"}: ${formatConflict(c, lookup)}`,
        ),
      };
    });
}
