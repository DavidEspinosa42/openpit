"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import sampleWorkspace from "../../data/samples/fictional-ridge.json";
import {
  type Conflict,
  type IntegrityIssue,
  parseWorkspaceText,
  type ScheduleDay,
  type SchoolConfig,
} from "../domain/index.ts";
import { validateDay } from "../engine/index.ts";
import {
  acquireWriterLock,
  BROWSER_DATA_DIR,
  IntegrityError,
  openStorage,
  type Repository,
  type SqlDatabase,
  type WriterLock,
} from "../storage/index.ts";
import { emptyDay } from "./edit.ts";

export type StorageStatus =
  | { readonly kind: "loading" }
  | { readonly kind: "locked" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "ready" };

export type ImportOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly issues: readonly IntegrityIssue[] };

export interface WorkspaceApi {
  readonly status: StorageStatus;
  readonly config: SchoolConfig | null;
  readonly dates: readonly string[];
  readonly date: string | null;
  readonly day: ScheduleDay | null;
  readonly conflicts: readonly Conflict[];
  /** Result of asking the browser for persistent storage; null until known. */
  readonly persistent: boolean | null;
  readonly error: string | null;
  clearError(): void;
  selectDate(date: string): void;
  createDay(date: string): Promise<boolean>;
  deleteDay(): Promise<void>;
  /** Applies a change to the stored day and saves it in one transaction. */
  editDay(change: (day: ScheduleDay) => ScheduleDay): Promise<boolean>;
  importText(text: string): Promise<ImportOutcome>;
  loadSample(): Promise<ImportOutcome>;
  exportJson(): Promise<string | null>;
}

const WorkspaceContext = createContext<WorkspaceApi | null>(null);

export function useWorkspace(): WorkspaceApi {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return value;
}

const DATE_KEY = "openpit.selectedDate";

function readRememberedDate(): string | null {
  try {
    return window.localStorage.getItem(DATE_KEY);
  } catch {
    return null;
  }
}

function rememberDate(date: string | null): void {
  try {
    if (date) window.localStorage.setItem(DATE_KEY, date);
  } catch {
    // Remembering the date is a convenience only.
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

/** Waits a little and tries again, because a previous page instance may still be releasing the lock. */
async function acquireWithRetry(): Promise<WriterLock | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const lock = await acquireWriterLock();
    if (lock) return lock;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return null;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<StorageStatus>({ kind: "loading" });
  const [config, setConfig] = useState<SchoolConfig | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [day, setDay] = useState<ScheduleDay | null>(null);
  const [persistent, setPersistent] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const repository = useRef<Repository | null>(null);
  const dayRef = useRef<ScheduleDay | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const show = useCallback(async (nextDate: string | null) => {
    const repo = repository.current;
    if (!repo) return;
    const loaded = nextDate ? await repo.getDay(nextDate) : null;
    dayRef.current = loaded;
    setDay(loaded);
    setDate(nextDate);
    rememberDate(nextDate);
  }, []);

  const refresh = useCallback(
    async (preferred: string | null) => {
      const repo = repository.current;
      if (!repo) return;
      const nextConfig = await repo.getConfig();
      const nextDates = await repo.listDates();
      setConfig(nextConfig);
      setDates(nextDates);
      const chosen =
        preferred && nextDates.includes(preferred) ? preferred : (nextDates[0] ?? null);
      await show(chosen);
    },
    [show],
  );

  // Open the database once, holding the single-writer lock for the life of the page.
  useEffect(() => {
    let cancelled = false;
    let lock: WriterLock | null = null;
    let db: SqlDatabase | null = null;

    (async () => {
      try {
        lock = await acquireWithRetry();
        if (cancelled) {
          lock?.release();
          return;
        }
        if (!lock) {
          setStatus({ kind: "locked" });
          return;
        }
        const storage = await openStorage(BROWSER_DATA_DIR);
        db = storage.db;
        if (cancelled) {
          await db.close();
          lock.release();
          return;
        }
        repository.current = storage.repository;
        try {
          if (typeof navigator !== "undefined" && navigator.storage?.persist) {
            setPersistent(await navigator.storage.persist());
          }
        } catch {
          setPersistent(false);
        }
        await refresh(readRememberedDate());
        if (!cancelled) setStatus({ kind: "ready" });
      } catch (caught) {
        if (!cancelled) setStatus({ kind: "error", message: describeError(caught) });
      }
    })();

    return () => {
      cancelled = true;
      repository.current = null;
      void db?.close();
      lock?.release();
    };
  }, [refresh]);

  const conflicts = useMemo<Conflict[]>(
    () => (config && day ? validateDay(config, day) : []),
    [config, day],
  );

  // Serialize writes so each one starts from the day the previous one saved.
  const enqueue = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(task, task);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  const editDay = useCallback(
    (change: (current: ScheduleDay) => ScheduleDay) =>
      enqueue(async () => {
        const repo = repository.current;
        const current = dayRef.current;
        if (!repo || !current) return false;
        try {
          const saved = await repo.saveDay(change(current));
          dayRef.current = saved;
          setDay(saved);
          setError(null);
          return true;
        } catch (caught) {
          setError(describeError(caught));
          // Reload what is really stored, so the screen never shows unsaved data.
          const stored = await repo.getDay(current.date);
          dayRef.current = stored;
          setDay(stored);
          return false;
        }
      }),
    [enqueue],
  );

  const selectDate = useCallback(
    (next: string) => {
      void enqueue(() => show(next)).catch((caught) => setError(describeError(caught)));
    },
    [enqueue, show],
  );

  const createDay = useCallback(
    (newDate: string) =>
      enqueue(async () => {
        const repo = repository.current;
        if (!repo) return false;
        try {
          if ((await repo.listDates()).includes(newDate)) {
            setError(`The day ${newDate} already exists.`);
            return false;
          }
          await repo.saveDay(emptyDay(newDate));
          await refresh(newDate);
          setError(null);
          return true;
        } catch (caught) {
          setError(describeError(caught));
          return false;
        }
      }),
    [enqueue, refresh],
  );

  const deleteDay = useCallback(
    () =>
      enqueue(async () => {
        const repo = repository.current;
        const current = dayRef.current;
        if (!repo || !current) return;
        try {
          await repo.deleteDay(current.date);
          await refresh(null);
        } catch (caught) {
          setError(describeError(caught));
        }
      }),
    [enqueue, refresh],
  );

  const importText = useCallback(
    (text: string) =>
      enqueue(async (): Promise<ImportOutcome> => {
        const repo = repository.current;
        if (!repo)
          return { ok: false, issues: [{ path: "(storage)", message: "Storage is not ready." }] };
        // Validate first; the repository validates again and writes in one transaction.
        const parsed = parseWorkspaceText(text);
        if (!parsed.ok) return { ok: false, issues: parsed.issues };
        try {
          await repo.replaceWorkspace(parsed.workspace);
          await refresh(dayRef.current?.date ?? null);
          setError(null);
          return { ok: true };
        } catch (caught) {
          if (caught instanceof IntegrityError) return { ok: false, issues: caught.issues };
          setError(describeError(caught));
          return { ok: false, issues: [{ path: "(storage)", message: describeError(caught) }] };
        }
      }),
    [enqueue, refresh],
  );

  const loadSample = useCallback(() => importText(JSON.stringify(sampleWorkspace)), [importText]);

  const exportJson = useCallback(
    () =>
      enqueue(async () => {
        const repo = repository.current;
        if (!repo) return null;
        const workspace = await repo.exportWorkspace();
        return workspace ? `${JSON.stringify(workspace, null, 2)}\n` : null;
      }),
    [enqueue],
  );

  const value = useMemo<WorkspaceApi>(
    () => ({
      status,
      config,
      dates,
      date,
      day,
      conflicts,
      persistent,
      error,
      clearError: () => setError(null),
      selectDate,
      createDay,
      deleteDay,
      editDay,
      importText,
      loadSample,
      exportJson,
    }),
    [
      status,
      config,
      dates,
      date,
      day,
      conflicts,
      persistent,
      error,
      selectDate,
      createDay,
      deleteDay,
      editDay,
      importText,
      loadSample,
      exportJson,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
