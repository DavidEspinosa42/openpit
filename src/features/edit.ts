import {
  formatMinute,
  isOnGrid,
  LabelSchema,
  parseTime,
  type ScheduleDay,
  type SchoolConfig,
  type Session,
  type TrackClosure,
  type VehicleUnavailability,
} from "../domain/index.ts";

/**
 * Pure helpers for editing a day and for the session form. No React, no storage. Every
 * function returns new objects and never mutates its input.
 */

/** Smallest unused id of the form `prefix-N`. */
export function nextId(prefix: string, existingIds: readonly string[]): string {
  const used = new Set(existingIds);
  for (let n = 1; ; n++) {
    const id = `${prefix}-${n}`;
    if (!used.has(id)) return id;
  }
}

export function upsertSession(day: ScheduleDay, session: Session): ScheduleDay {
  const exists = day.sessions.some((s) => s.id === session.id);
  return {
    ...day,
    sessions: exists
      ? day.sessions.map((s) => (s.id === session.id ? session : s))
      : [...day.sessions, session],
  };
}

export function removeSession(day: ScheduleDay, sessionId: string): ScheduleDay {
  return { ...day, sessions: day.sessions.filter((s) => s.id !== sessionId) };
}

export function setSessionStatus(
  day: ScheduleDay,
  sessionId: string,
  status: Session["status"],
): ScheduleDay {
  return { ...day, sessions: day.sessions.map((s) => (s.id === sessionId ? { ...s, status } : s)) };
}

export function addClosure(day: ScheduleDay, closure: TrackClosure): ScheduleDay {
  return { ...day, closures: [...day.closures, closure] };
}

export function removeClosure(day: ScheduleDay, closureId: string): ScheduleDay {
  return { ...day, closures: day.closures.filter((c) => c.id !== closureId) };
}

export function addUnavailability(day: ScheduleDay, window: VehicleUnavailability): ScheduleDay {
  return { ...day, unavailabilities: [...day.unavailabilities, window] };
}

export function removeUnavailability(day: ScheduleDay, windowId: string): ScheduleDay {
  return { ...day, unavailabilities: day.unavailabilities.filter((u) => u.id !== windowId) };
}

export function emptyDay(date: string): ScheduleDay {
  return { date, revision: 0, sessions: [], closures: [], unavailabilities: [] };
}

// ---------------------------------------------------------------------------------------
// Session form
// ---------------------------------------------------------------------------------------

/** The session form holds text, because that is what people type. */
export interface SessionDraft {
  readonly id: string;
  readonly label: string;
  readonly activityTypeId: string;
  /** Empty string means "no layout". */
  readonly layoutId: string;
  readonly start: string;
  readonly end: string;
  readonly vehicleIds: readonly string[];
  readonly pitBoxIds: readonly string[];
  readonly status: Session["status"];
}

export type DraftField = "label" | "activityTypeId" | "layoutId" | "start" | "end";

export type DraftResult =
  | { readonly ok: true; readonly session: Session }
  | { readonly ok: false; readonly errors: Partial<Record<DraftField, string>> };

export function draftFromSession(session: Session): SessionDraft {
  return {
    id: session.id,
    label: session.label,
    activityTypeId: session.activityTypeId,
    layoutId: session.layoutId ?? "",
    start: formatMinute(session.startMinute),
    end: formatMinute(session.endMinute),
    vehicleIds: session.vehicleIds,
    pitBoxIds: session.pitBoxIds,
    status: session.status,
  };
}

/** A starting point for "new session": first activity, first layout, the opening hour. */
export function newDraft(config: SchoolConfig, day: ScheduleDay): SessionDraft {
  const activity = config.activityTypes[0];
  const hours = config.circuit.operatingHours;
  const start = hours.startMinute;
  const end = Math.min(hours.endMinute, start + 60);
  return {
    id: nextId(
      "session",
      day.sessions.map((s) => s.id),
    ),
    label: "",
    activityTypeId: activity?.id ?? "",
    layoutId: activity?.usesTrack ? (config.circuit.layouts[0]?.id ?? "") : "",
    start: formatMinute(start),
    end: formatMinute(end),
    vehicleIds: [],
    pitBoxIds: [],
    status: "planned",
  };
}

/** Changing the activity keeps the layout consistent with whether it uses the track. */
export function withActivity(
  config: SchoolConfig,
  draft: SessionDraft,
  activityTypeId: string,
): SessionDraft {
  const activity = config.activityTypes.find((a) => a.id === activityTypeId);
  const layoutId = activity?.usesTrack
    ? draft.layoutId || (config.circuit.layouts[0]?.id ?? "")
    : "";
  return { ...draft, activityTypeId, layoutId };
}

export function validateDraft(config: SchoolConfig, draft: SessionDraft): DraftResult {
  const errors: Partial<Record<DraftField, string>> = {};
  const activity = config.activityTypes.find((a) => a.id === draft.activityTypeId);
  const grid = config.gridMinutes;

  const label = draft.label.trim();
  if (!LabelSchema.safeParse(label).success) errors.label = "Use at most 80 characters.";
  if (!activity) errors.activityTypeId = "Choose an activity.";

  if (activity?.usesTrack) {
    if (!draft.layoutId) errors.layoutId = "Choose a track layout.";
    else if (!config.circuit.layouts.some((l) => l.id === draft.layoutId)) {
      errors.layoutId = "Choose one of the listed layouts.";
    }
  }

  const start = parseTime(draft.start);
  const end = parseTime(draft.end);
  if (start === null) errors.start = "Enter a time as HH:MM, for example 09:30.";
  else if (!isOnGrid(start, grid)) errors.start = `Use a multiple of ${grid} minutes.`;
  if (end === null) errors.end = "Enter a time as HH:MM, for example 10:30.";
  else if (!isOnGrid(end, grid)) errors.end = `Use a multiple of ${grid} minutes.`;
  if (start !== null && end !== null && !errors.start && !errors.end && end <= start) {
    errors.end = "The end must be after the start.";
  }

  if (Object.keys(errors).length > 0 || !activity || start === null || end === null) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    session: {
      id: draft.id,
      label,
      activityTypeId: activity.id,
      layoutId: activity.usesTrack ? draft.layoutId : null,
      startMinute: start,
      endMinute: end,
      vehicleIds: [...draft.vehicleIds],
      pitBoxIds: [...draft.pitBoxIds],
      status: draft.status,
    },
  };
}

/** Shared validation for closure and unavailability windows (times as text). */
export interface WindowDraft {
  readonly targetId: string;
  readonly start: string;
  readonly end: string;
  readonly reason: string;
}

export type WindowResult =
  | {
      readonly ok: true;
      readonly startMinute: number;
      readonly endMinute: number;
      readonly reason: string;
    }
  | {
      readonly ok: false;
      readonly errors: Partial<Record<"targetId" | "start" | "end" | "reason", string>>;
    };

export function validateWindow(config: SchoolConfig, draft: WindowDraft): WindowResult {
  const errors: Partial<Record<"targetId" | "start" | "end" | "reason", string>> = {};
  const grid = config.gridMinutes;
  if (!draft.targetId) errors.targetId = "Choose one.";
  const start = parseTime(draft.start);
  const end = parseTime(draft.end);
  if (start === null) errors.start = "Enter a time as HH:MM.";
  else if (!isOnGrid(start, grid)) errors.start = `Use a multiple of ${grid} minutes.`;
  if (end === null) errors.end = "Enter a time as HH:MM.";
  else if (!isOnGrid(end, grid)) errors.end = `Use a multiple of ${grid} minutes.`;
  if (start !== null && end !== null && !errors.start && !errors.end && end <= start) {
    errors.end = "The end must be after the start.";
  }
  const reason = draft.reason.trim();
  if (!LabelSchema.safeParse(reason).success) errors.reason = "Use at most 80 characters.";
  if (Object.keys(errors).length > 0 || start === null || end === null)
    return { ok: false, errors };
  return { ok: true, startMinute: start, endMinute: end, reason };
}
