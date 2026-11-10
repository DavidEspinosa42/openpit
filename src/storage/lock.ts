/**
 * Single-writer rule (invariant 7): one browser tab owns the database. A tab takes a Web Lock
 * for as long as it is open; another tab fails to get it and shows a notice instead.
 */

export interface LockProvider {
  request(
    name: string,
    options: { ifAvailable: true },
    callback: (lock: unknown) => Promise<void> | void,
  ): Promise<unknown>;
}

export interface WriterLock {
  /** False when the browser has no Web Locks API; the tab then cannot be protected. */
  readonly exclusive: boolean;
  release(): void;
}

export const WRITER_LOCK_NAME = "openpit-writer";

function browserLocks(): LockProvider | null {
  const nav = globalThis.navigator as { locks?: LockProvider } | undefined;
  return nav?.locks ?? null;
}

/**
 * Resolves to a lock handle, or null when another tab already holds the lock. Pass `null` as
 * the provider to simulate a browser without Web Locks.
 */
export function acquireWriterLock(
  provider: LockProvider | null = browserLocks(),
  name: string = WRITER_LOCK_NAME,
): Promise<WriterLock | null> {
  if (!provider) return Promise.resolve({ exclusive: false, release() {} });
  return new Promise((resolve, reject) => {
    provider
      .request(name, { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(null);
          return;
        }
        // Holding the lock means keeping this promise pending until release().
        return new Promise<void>((done) => {
          resolve({ exclusive: true, release: () => done() });
        });
      })
      .catch(reject);
  });
}
