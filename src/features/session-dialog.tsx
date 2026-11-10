"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  CONFLICT_TITLES,
  createLookup,
  formatConflict,
  formatMinute,
  type ScheduleDay,
  type SchoolConfig,
  type Session,
  type Suggestion,
} from "../domain/index.ts";
import { suggestSlots, validateDay } from "../engine/index.ts";
import {
  type DraftField,
  type SessionDraft,
  upsertSession,
  validateDraft,
  withActivity,
} from "./edit.ts";
import styles from "./session-dialog.module.css";

export interface SessionDialogProps {
  config: SchoolConfig;
  day: ScheduleDay;
  initial: SessionDraft;
  /** True when the session does not exist yet. */
  isNew: boolean;
  onSave: (session: Session) => Promise<boolean>;
  onSetStatus: (status: "planned" | "cancelled") => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onClose: () => void;
}

function toggle(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function SessionDialog({
  config,
  day,
  initial,
  isNew,
  onSave,
  onSetStatus,
  onDelete,
  onClose,
}: SessionDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const [draft, setDraft] = useState<SessionDraft>(initial);
  const [errors, setErrors] = useState<Partial<Record<DraftField, string>>>({});
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const activity = config.activityTypes.find((a) => a.id === draft.activityTypeId);
  const result = useMemo(() => validateDraft(config, draft), [config, draft]);
  const previewDay = useMemo(
    () => (result.ok ? upsertSession(day, result.session) : null),
    [day, result],
  );
  const preview = useMemo(() => {
    if (!previewDay) return null;
    const conflicts = validateDay(config, previewDay).filter((c) =>
      c.sessionIds.includes(draft.id),
    );
    const lookup = createLookup(config, previewDay);
    return conflicts.map((c) => ({
      key: c.key,
      severity: c.severity,
      title: CONFLICT_TITLES[c.code],
      text: formatConflict(c, lookup),
    }));
  }, [config, previewDay, draft.id]);

  const change = (patch: Partial<SessionDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setSuggestions(null);
    setNote("");
    setFailed(false);
  };

  const fieldError = (field: DraftField) => errors[field];
  const describedBy = (field: DraftField) => (errors[field] ? `${uid}-${field}-error` : undefined);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const checked = validateDraft(config, draft);
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    const saved = await onSave(checked.session);
    setBusy(false);
    if (saved) ref.current?.close();
    else setFailed(true);
  };

  const suggest = () => {
    if (!previewDay || !result.ok) return;
    const found = suggestSlots(config, previewDay, draft.id, { limit: 3 });
    setSuggestions(found);
    setNote("");
  };

  const apply = (suggestion: Suggestion) => {
    setDraft((d) => ({
      ...d,
      start: formatMinute(suggestion.startMinute),
      end: formatMinute(suggestion.endMinute),
    }));
    setSuggestions(null);
    setNote(
      `Time set to ${formatMinute(suggestion.startMinute)}-${formatMinute(suggestion.endMinute)}. Save the session to keep it.`,
    );
  };

  const run = async (action: () => Promise<boolean>) => {
    setBusy(true);
    const done = await action();
    setBusy(false);
    if (done) ref.current?.close();
    else setFailed(true);
  };

  const categoryName = (id: string) => config.categories.find((c) => c.id === id)?.name ?? id;

  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby={`${uid}-title`} onClose={onClose}>
      <form onSubmit={save} noValidate className={styles.form}>
        <h2 id={`${uid}-title`}>{isNew ? "New session" : "Edit session"}</h2>

        <div className={styles.grid}>
          <div className="field">
            <label htmlFor={`${uid}-label`}>Label</label>
            <input
              id={`${uid}-label`}
              className="input"
              value={draft.label}
              maxLength={120}
              aria-invalid={fieldError("label") ? true : undefined}
              aria-describedby={describedBy("label")}
              onChange={(e) => change({ label: e.target.value })}
            />
            <span className="hint">
              A short name for the day schedule. Do not enter personal data.
            </span>
            {fieldError("label") ? (
              <span id={`${uid}-label-error`} className="error">
                {fieldError("label")}
              </span>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor={`${uid}-activity`}>Activity</label>
            <select
              id={`${uid}-activity`}
              className="select"
              value={draft.activityTypeId}
              onChange={(e) => {
                setDraft((d) => withActivity(config, d, e.target.value));
                setSuggestions(null);
              }}
            >
              {config.activityTypes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} {a.usesTrack ? "(on track)" : "(off track)"}
                </option>
              ))}
            </select>
          </div>

          {activity?.usesTrack ? (
            <div className="field">
              <label htmlFor={`${uid}-layout`}>Track layout</label>
              <select
                id={`${uid}-layout`}
                className="select"
                value={draft.layoutId}
                aria-invalid={fieldError("layoutId") ? true : undefined}
                aria-describedby={describedBy("layoutId")}
                onChange={(e) => change({ layoutId: e.target.value })}
              >
                {config.circuit.layouts.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              {fieldError("layoutId") ? (
                <span id={`${uid}-layoutId-error`} className="error">
                  {fieldError("layoutId")}
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="field">
            <label htmlFor={`${uid}-start`}>Start (HH:MM)</label>
            <input
              id={`${uid}-start`}
              className="input"
              inputMode="numeric"
              autoComplete="off"
              value={draft.start}
              aria-invalid={fieldError("start") ? true : undefined}
              aria-describedby={describedBy("start")}
              onChange={(e) => change({ start: e.target.value })}
            />
            {fieldError("start") ? (
              <span id={`${uid}-start-error`} className="error">
                {fieldError("start")}
              </span>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor={`${uid}-end`}>End (HH:MM)</label>
            <input
              id={`${uid}-end`}
              className="input"
              inputMode="numeric"
              autoComplete="off"
              value={draft.end}
              aria-invalid={fieldError("end") ? true : undefined}
              aria-describedby={describedBy("end")}
              onChange={(e) => change({ end: e.target.value })}
            />
            <span className="hint">Times are multiples of {config.gridMinutes} minutes.</span>
            {fieldError("end") ? (
              <span id={`${uid}-end-error`} className="error">
                {fieldError("end")}
              </span>
            ) : null}
          </div>
        </div>

        <fieldset>
          <legend className="legend">Vehicles</legend>
          {config.vehicles.length === 0 ? (
            <p className="hint">This school has no vehicles configured.</p>
          ) : (
            <div className="checks">
              {config.vehicles.map((v) => (
                <label key={v.id} className="check">
                  <input
                    type="checkbox"
                    checked={draft.vehicleIds.includes(v.id)}
                    onChange={() => change({ vehicleIds: toggle(draft.vehicleIds, v.id) })}
                  />
                  <span>
                    {v.name}{" "}
                    <span className="hint">
                      ({categoryName(v.categoryId)}
                      {v.status === "available" ? "" : `, ${v.status}`})
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend className="legend">Pit boxes</legend>
          {config.pitBoxes.length === 0 ? (
            <p className="hint">This school has no pit boxes configured.</p>
          ) : (
            <div className="checks">
              {config.pitBoxes.map((p) => (
                <label key={p.id} className="check">
                  <input
                    type="checkbox"
                    checked={draft.pitBoxIds.includes(p.id)}
                    onChange={() => change({ pitBoxIds: toggle(draft.pitBoxIds, p.id) })}
                  />
                  <span>
                    {p.name} <span className="hint">(holds {p.capacity})</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <section className={styles.preview} aria-labelledby={`${uid}-preview`}>
          <h3 id={`${uid}-preview`}>Conflicts for this session</h3>
          {preview === null ? (
            <p className="hint">Fix the problems above to check this session against the rules.</p>
          ) : preview.length === 0 ? (
            <p>No conflicts. This session fits the rules.</p>
          ) : (
            <ul className={styles.previewList}>
              {preview.map((p) => (
                <li
                  key={p.key}
                  className={p.severity === "blocking" ? styles.isBlocking : styles.isWarning}
                >
                  <strong>
                    {p.severity === "blocking" ? "Blocking" : "Warning"}: {p.title}.
                  </strong>{" "}
                  {p.text}
                </li>
              ))}
            </ul>
          )}

          <div className={styles.suggestRow}>
            <button type="button" className="btn" onClick={suggest} disabled={!result.ok}>
              Suggest a time
            </button>
            <span className="hint">
              Finds the nearest start times with no blocking conflict, keeping the same length.
            </span>
          </div>

          <div role="status" aria-live="polite">
            {suggestions !== null && suggestions.length === 0 ? (
              <p>
                No conflict-free start time exists for this session today. Change the vehicles, pit
                boxes or layout and try again.
              </p>
            ) : null}
            {suggestions !== null && suggestions.length > 0 ? (
              <ul className={styles.suggestions}>
                {suggestions.map((s) => (
                  <li key={s.startMinute}>
                    <button type="button" className="btn btnSmall" onClick={() => apply(s)}>
                      Use {formatMinute(s.startMinute)}-{formatMinute(s.endMinute)}
                    </button>{" "}
                    <span className="hint">
                      {s.shiftMinutes < 0
                        ? `${-s.shiftMinutes} min earlier`
                        : `${s.shiftMinutes} min later`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {note ? <p>{note}</p> : null}
          </div>
        </section>

        {failed ? (
          <p role="alert" className="error">
            The change was not saved. The schedule on screen is the stored one. The reason is shown
            at the top of the page after you close this dialog.
          </p>
        ) : null}

        <div className={styles.buttons}>
          <button type="submit" className="btn btnPrimary" disabled={busy}>
            Save session
          </button>
          {!isNew ? (
            <>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() =>
                  run(() => onSetStatus(initial.status === "cancelled" ? "planned" : "cancelled"))
                }
              >
                {initial.status === "cancelled" ? "Restore this session" : "Cancel this session"}
              </button>
              <button
                type="button"
                className="btn btnDanger"
                disabled={busy}
                onClick={() => {
                  if (window.confirm("Delete this session permanently?")) void run(onDelete);
                }}
              >
                Delete session
              </button>
            </>
          ) : null}
          <button type="button" className="btn" onClick={() => ref.current?.close()}>
            Close without saving
          </button>
        </div>
      </form>
    </dialog>
  );
}
