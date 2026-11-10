"use client";

import { useId, useState } from "react";
import {
  createLookup,
  formatMinute,
  type ScheduleDay,
  type SchoolConfig,
} from "../domain/index.ts";
import styles from "./adjustments.module.css";
import {
  addClosure,
  addUnavailability,
  nextId,
  removeClosure,
  removeUnavailability,
  validateWindow,
  type WindowDraft,
} from "./edit.ts";

type Errors = Partial<Record<"targetId" | "start" | "end" | "reason", string>>;

function WindowForm({
  title,
  targetLabel,
  targets,
  submitLabel,
  onSubmit,
  config,
}: {
  title: string;
  targetLabel: string;
  targets: readonly { id: string; name: string }[];
  submitLabel: string;
  onSubmit: (window: {
    targetId: string;
    startMinute: number;
    endMinute: number;
    reason: string;
  }) => Promise<boolean>;
  config: SchoolConfig;
}) {
  const uid = useId();
  const hours = config.circuit.operatingHours;
  const initial: WindowDraft = {
    targetId: targets[0]?.id ?? "",
    start: formatMinute(hours.startMinute),
    end: formatMinute(Math.min(hours.endMinute, hours.startMinute + 60)),
    reason: "",
  };
  const [draft, setDraft] = useState<WindowDraft>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const result = validateWindow(config, draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    const saved = await onSubmit({
      targetId: draft.targetId,
      startMinute: result.startMinute,
      endMinute: result.endMinute,
      reason: result.reason,
    });
    setBusy(false);
    if (saved) setDraft((d) => ({ ...d, reason: "" }));
  };

  const err = (field: keyof Errors) =>
    errors[field] ? (
      <span id={`${uid}-${field}-error`} className="error">
        {errors[field]}
      </span>
    ) : null;
  const described = (field: keyof Errors) => (errors[field] ? `${uid}-${field}-error` : undefined);

  return (
    <form onSubmit={submit} noValidate className={styles.form} aria-label={title}>
      <h3>{title}</h3>
      <div className={styles.fields}>
        <div className="field">
          <label htmlFor={`${uid}-target`}>{targetLabel}</label>
          <select
            id={`${uid}-target`}
            className="select"
            value={draft.targetId}
            aria-invalid={errors.targetId ? true : undefined}
            aria-describedby={described("targetId")}
            onChange={(e) => setDraft({ ...draft, targetId: e.target.value })}
          >
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {err("targetId")}
        </div>
        <div className="field">
          <label htmlFor={`${uid}-start`}>From (HH:MM)</label>
          <input
            id={`${uid}-start`}
            className="input"
            inputMode="numeric"
            autoComplete="off"
            value={draft.start}
            aria-invalid={errors.start ? true : undefined}
            aria-describedby={described("start")}
            onChange={(e) => setDraft({ ...draft, start: e.target.value })}
          />
          {err("start")}
        </div>
        <div className="field">
          <label htmlFor={`${uid}-end`}>To (HH:MM)</label>
          <input
            id={`${uid}-end`}
            className="input"
            inputMode="numeric"
            autoComplete="off"
            value={draft.end}
            aria-invalid={errors.end ? true : undefined}
            aria-describedby={described("end")}
            onChange={(e) => setDraft({ ...draft, end: e.target.value })}
          />
          {err("end")}
        </div>
        <div className="field">
          <label htmlFor={`${uid}-reason`}>Reason (optional)</label>
          <input
            id={`${uid}-reason`}
            className="input"
            value={draft.reason}
            aria-invalid={errors.reason ? true : undefined}
            aria-describedby={described("reason")}
            onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
          />
          {err("reason")}
        </div>
      </div>
      <div>
        <button type="submit" className="btn" disabled={busy || targets.length === 0}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

export function Adjustments({
  config,
  day,
  onEdit,
}: {
  config: SchoolConfig;
  day: ScheduleDay;
  onEdit: (change: (day: ScheduleDay) => ScheduleDay) => Promise<boolean>;
}) {
  const lookup = createLookup(config, day);
  return (
    <section className={styles.section} aria-labelledby="adjust-title">
      <h2 id="adjust-title">Adjustments for the day</h2>
      <p className="hint">
        Close a track section or mark a vehicle unavailable for a time window. Sessions that overlap
        a window are flagged as conflicts.
      </p>
      <div className={styles.columns}>
        <div>
          <WindowForm
            title="Close a track section"
            targetLabel="Track section"
            targets={config.circuit.sections}
            submitLabel="Add closure"
            config={config}
            onSubmit={(w) =>
              onEdit((d) =>
                addClosure(d, {
                  id: nextId(
                    "closure",
                    d.closures.map((c) => c.id),
                  ),
                  sectionId: w.targetId,
                  startMinute: w.startMinute,
                  endMinute: w.endMinute,
                  reason: w.reason,
                }),
              )
            }
          />
          {day.closures.length === 0 ? (
            <p className="hint">No closures today.</p>
          ) : (
            <ul className={styles.list} aria-label="Closures">
              {day.closures.map((c) => (
                <li key={c.id}>
                  <span>
                    <strong>{lookup.sectionName(c.sectionId)}</strong> closed{" "}
                    <span className="num">
                      {formatMinute(c.startMinute)}-{formatMinute(c.endMinute)}
                    </span>
                    {c.reason ? ` (${c.reason})` : ""}
                  </span>
                  <button
                    type="button"
                    className="btn btnSmall"
                    aria-label={`Remove closure of ${lookup.sectionName(c.sectionId)} at ${formatMinute(c.startMinute)}`}
                    onClick={() => void onEdit((d) => removeClosure(d, c.id))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <WindowForm
            title="Mark a vehicle unavailable"
            targetLabel="Vehicle"
            targets={config.vehicles}
            submitLabel="Add unavailability"
            config={config}
            onSubmit={(w) =>
              onEdit((d) =>
                addUnavailability(d, {
                  id: nextId(
                    "unavailable",
                    d.unavailabilities.map((u) => u.id),
                  ),
                  vehicleId: w.targetId,
                  startMinute: w.startMinute,
                  endMinute: w.endMinute,
                  reason: w.reason,
                }),
              )
            }
          />
          {day.unavailabilities.length === 0 ? (
            <p className="hint">No vehicle is marked unavailable today.</p>
          ) : (
            <ul className={styles.list} aria-label="Vehicle unavailability">
              {day.unavailabilities.map((u) => (
                <li key={u.id}>
                  <span>
                    <strong>{lookup.vehicleName(u.vehicleId)}</strong> unavailable{" "}
                    <span className="num">
                      {formatMinute(u.startMinute)}-{formatMinute(u.endMinute)}
                    </span>
                    {u.reason ? ` (${u.reason})` : ""}
                  </span>
                  <button
                    type="button"
                    className="btn btnSmall"
                    aria-label={`Remove unavailability of ${lookup.vehicleName(u.vehicleId)} at ${formatMinute(u.startMinute)}`}
                    onClick={() => void onEdit((d) => removeUnavailability(d, u.id))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
