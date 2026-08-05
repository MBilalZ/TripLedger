import { reportError } from "@/lib/reportError";
import { listOutbox, markOutboxError, refreshPendingCount, removeOutbox } from "./outbox";
import {
  beginSyncing,
  endSyncing,
  setOnline,
  setSyncError,
} from "./status";

let flushPromise: Promise<void> | null = null;
let flushDirty = false;
let started = false;

function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

/** Single dynamic import boundary for all cloud API / repo work. */
async function cloudOps() {
  return import("./cloudOps");
}

export async function pullTrip(tripId: string): Promise<void> {
  if (!isOnline()) return;
  const ops = await cloudOps();
  await ops.pullTrip(tripId);
}

export async function flushOutbox(tripId?: string): Promise<void> {
  if (!isOnline()) {
    setOnline(false);
    await refreshPendingCount();
    return;
  }
  setOnline(true);

  if (flushPromise) {
    flushDirty = true;
    await flushPromise;
    return;
  }

  flushPromise = (async () => {
    beginSyncing();
    setSyncError(null);
    try {
      do {
        flushDirty = false;
        const ops = await cloudOps();
        const rows = await listOutbox(tripId);
        for (const row of rows) {
          try {
            await ops.applyOutboxRowPrecise(row);
            await removeOutbox(row.id);
            if (row.tripId && row.op !== "deleteTrip") {
              try {
                await ops.pullTrip(row.tripId);
              } catch (pullErr) {
                reportError(pullErr, {
                  tag: "sync.pull_after_push",
                  tripId: row.tripId,
                  op: row.op,
                });
              }
            }
          } catch (e) {
            const message = e instanceof Error ? e.message : "Sync failed";
            await markOutboxError(row.id, message);
            setSyncError(message);
            reportError(e, { tag: "sync.outbox", tripId: row.tripId, op: row.op });
            // Keep-both: do not drop the op; stop this pass so order is preserved.
            break;
          }
        }
        await refreshPendingCount();
      } while (flushDirty);
    } finally {
      endSyncing();
      flushPromise = null;
    }
  })();

  await flushPromise;
}

export async function syncTrip(tripId: string): Promise<void> {
  await flushOutbox(tripId);
  if (isOnline()) {
    beginSyncing();
    try {
      await pullTrip(tripId);
      setSyncError(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Pull failed";
      setSyncError(message);
    } finally {
      endSyncing();
    }
  }
}

export async function syncAllCloudTrips(): Promise<void> {
  if (!isOnline()) {
    setOnline(false);
    await refreshPendingCount();
    return;
  }
  setOnline(true);

  beginSyncing();
  try {
    await flushOutbox();
    const ops = await cloudOps();
    await ops.syncAllCloudTripsWork();
    setSyncError(null);
  } catch (e) {
    setSyncError(e instanceof Error ? e.message : "Sync failed");
  } finally {
    endSyncing();
    await refreshPendingCount();
  }
}

export function startSyncEngine(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  const onOnline = () => {
    setOnline(true);
    void syncAllCloudTrips();
  };
  const onOffline = () => {
    setOnline(false);
  };

  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && isOnline()) {
      void syncAllCloudTrips();
    }
  });

  setOnline(isOnline());
  void refreshPendingCount();
  if (isOnline()) void syncAllCloudTrips();

  window.setInterval(() => {
    if (isOnline()) void flushOutbox();
  }, 60_000);
}
