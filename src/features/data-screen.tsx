"use client";

import { useRef, useState } from "react";
import { formatMinute, type IntegrityIssue, MAX_IMPORT_BYTES } from "../domain/index.ts";
import styles from "./data-screen.module.css";
import { useWorkspace } from "./workspace-provider.tsx";

const MAX_SHOWN_ISSUES = 20;

function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function DataScreen() {
  const ws = useWorkspace();
  const fileInput = useRef<HTMLInputElement>(null);
  const [issues, setIssues] = useState<readonly IntegrityIssue[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const { config } = ws;

  const confirmReplace = () =>
    !config ||
    window.confirm(
      "Replace everything stored in this browser with this file? The current school and all its days will be removed. Export a backup first if you may need them.",
    );

  const reportOutcome = (outcome: Awaited<ReturnType<typeof ws.importText>>, success: string) => {
    if (outcome.ok) {
      setIssues([]);
      setMessage(success);
    } else {
      setIssues(outcome.issues);
      setMessage("");
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setMessage("");
    if (file.size > MAX_IMPORT_BYTES) {
      setIssues([
        {
          path: file.name,
          message: `The file is larger than ${MAX_IMPORT_BYTES / (1024 * 1024)} MiB.`,
        },
      ]);
      return;
    }
    if (!confirmReplace()) {
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    setBusy(true);
    const outcome = await ws.importText(await file.text());
    setBusy(false);
    reportOutcome(outcome, `Imported ${file.name}.`);
    if (fileInput.current) fileInput.current.value = "";
  };

  const exportBackup = async () => {
    setBusy(true);
    const text = await ws.exportJson();
    setBusy(false);
    if (text === null) {
      setMessage("There is nothing to export yet.");
      return;
    }
    const stamp = ws.date ?? "workspace";
    download(`openpit-backup-${stamp}.json`, text);
    setMessage("Backup downloaded. Keep it somewhere safe.");
  };

  const loadSample = async () => {
    if (!confirmReplace()) return;
    setBusy(true);
    const outcome = await ws.loadSample();
    setBusy(false);
    reportOutcome(outcome, "Loaded the fictional sample school.");
  };

  return (
    <div className={styles.page}>
      <h1>Data</h1>

      <section className={styles.card} aria-labelledby="storage-title">
        <h2 id="storage-title">Where your data lives</h2>
        <p>
          OpenPit keeps everything in this browser, on this device. Nothing is sent anywhere and no
          personal data is stored. Browsers can still delete site data, for example when storage is
          low or when you clear browsing data, so export a backup regularly.
        </p>
        <p role="status">
          {ws.persistent === null
            ? "Checking whether the browser protects this data from automatic cleanup…"
            : ws.persistent
              ? "The browser has agreed to keep this data unless you clear it."
              : "The browser has not promised to keep this data. It may be removed when storage runs low. Keep a backup."}
        </p>
      </section>

      <section className={styles.card} aria-labelledby="backup-title">
        <h2 id="backup-title">Back up and restore</h2>
        <div className={styles.actions}>
          <button
            type="button"
            className="btn btnPrimary"
            onClick={exportBackup}
            disabled={busy || !config}
          >
            Export backup (JSON)
          </button>
          <div className="field">
            <label htmlFor="import-file">Import a workspace file (JSON)</label>
            <input
              ref={fileInput}
              id="import-file"
              className="input"
              type="file"
              accept="application/json,.json"
              disabled={busy}
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <span className="hint">
              The whole file is checked before anything is saved. If it has a problem, your current
              data stays as it is.
            </span>
          </div>
          <button type="button" className="btn" onClick={loadSample} disabled={busy}>
            Load the fictional sample school
          </button>
        </div>

        <div role="status" aria-live="polite">
          {message ? <p className={styles.success}>{message}</p> : null}
        </div>

        {issues.length > 0 ? (
          <div className={styles.issues} role="alert">
            <h3>This file was not imported</h3>
            <p>Nothing was changed. Fix these problems and try again.</p>
            <ul>
              {issues.slice(0, MAX_SHOWN_ISSUES).map((issue) => (
                <li key={`${issue.path}:${issue.message}`}>
                  <code>{issue.path}</code>: {issue.message}
                </li>
              ))}
            </ul>
            {issues.length > MAX_SHOWN_ISSUES ? (
              <p>…and {issues.length - MAX_SHOWN_ISSUES} more.</p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className={styles.card} aria-labelledby="config-title">
        <h2 id="config-title">School configuration</h2>
        {!config ? (
          <p>No school is loaded. Import a file or load the fictional sample.</p>
        ) : (
          <>
            <p>
              The configuration comes from the imported file. To change it, edit the JSON file and
              import it again.
            </p>
            <table className="table">
              <tbody>
                <tr>
                  <th scope="row">School</th>
                  <td>{config.name}</td>
                </tr>
                <tr>
                  <th scope="row">Circuit</th>
                  <td>
                    {config.circuit.name}: {config.circuit.sections.length} sections,{" "}
                    {config.circuit.layouts.length} layouts
                  </td>
                </tr>
                <tr>
                  <th scope="row">Operating hours</th>
                  <td className="num">
                    {formatMinute(config.circuit.operatingHours.startMinute)}-
                    {formatMinute(config.circuit.operatingHours.endMinute)}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Track clearance</th>
                  <td>{config.circuit.clearanceMinutes} minutes</td>
                </tr>
                <tr>
                  <th scope="row">Time grid</th>
                  <td>{config.gridMinutes} minutes</td>
                </tr>
                <tr>
                  <th scope="row">Vehicle categories</th>
                  <td>
                    {config.categories
                      .map((c) => `${c.name} (turnaround ${c.turnaroundMinutes} min)`)
                      .join(", ")}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Vehicles</th>
                  <td>{config.vehicles.length}</td>
                </tr>
                <tr>
                  <th scope="row">Activities</th>
                  <td>{config.activityTypes.map((a) => a.name).join(", ")}</td>
                </tr>
                <tr>
                  <th scope="row">Pit boxes</th>
                  <td>{config.pitBoxes.length}</td>
                </tr>
                <tr>
                  <th scope="row">Days stored</th>
                  <td>{ws.dates.length === 0 ? "None" : ws.dates.join(", ")}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}
      </section>
    </div>
  );
}
