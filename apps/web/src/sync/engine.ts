import { requireUser } from "@/api/supabase";
import * as tripsApi from "@/api/trips";
import { loadWorkspace } from "@/api/workspace";
import {
  type AdjustmentRow,
  type ExpenseRow,
  type ExpenseSplitRow,
  newId,
  type OutboxRow,
  type PoolMemberRow,
  type TripRow,
} from "@/db/dexie";
import { reportError } from "@/lib/reportError";
import { cloudTripListRepo } from "@/repositories/cloud/tripList";
import { cloudWorkspaceRepo } from "@/repositories/cloud/workspace";
import {
  deleteCachedTrip,
  listCachedCloudTrips,
  readCachedWorkspace,
  writeCachedWorkspace,
} from "./cache";
import { listOutbox, markOutboxError, refreshPendingCount, removeOutbox } from "./outbox";
import { noteKeepBothMerge, setOnline, setSyncError, setSyncing } from "./status";

let flushPromise: Promise<void> | null = null;
let started = false;

function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

async function applyOutboxRow(row: OutboxRow): Promise<void> {
  const p = row.payload as Record<string, unknown>;
  switch (row.op) {
    case "createTrip": {
      const trip = p.trip as TripRow | undefined;
      if (trip) {
        await tripsApi.createTripWithIds(
          trip.id,
          String(p.participantId ?? newId("p")),
          trip.name,
          {
            transferMode: trip.transferMode,
            settlementRounding: trip.settlementRounding,
          },
        );
      }
      break;
    }
    case "deleteTrip":
      await cloudTripListRepo.delete(row.tripId);
      await deleteCachedTrip(row.tripId);
      break;
    case "touchTrip":
      await cloudTripListRepo.touch(row.tripId);
      break;
    case "addParticipant":
      await cloudWorkspaceRepo.addParticipant(
        row.tripId,
        String(p.displayName),
        (p.pools as Parameters<typeof cloudWorkspaceRepo.addParticipant>[2]) ?? [],
      );
      // Prefer payload with pre-built participant so ids match — re-call with known ids via API path below if needed.
      break;
    case "removeParticipant":
      await cloudWorkspaceRepo.removeParticipant(String(p.participantId));
      break;
    case "updateParticipant":
      await cloudWorkspaceRepo.updateParticipant(String(p.id), String(p.displayName));
      break;
    case "updateTrip":
      await cloudWorkspaceRepo.updateTrip(row.tripId, p.patch as { name?: string });
      break;
    case "addPool":
      await cloudWorkspaceRepo.addPool(
        row.tripId,
        String(p.name),
        (p.participants as Parameters<typeof cloudWorkspaceRepo.addPool>[2]) ?? [],
      );
      break;
    case "removePool":
      await cloudWorkspaceRepo.removePool(String(p.poolId));
      break;
    case "updatePool":
      await cloudWorkspaceRepo.updatePool(
        String(p.id),
        p.patch as Parameters<typeof cloudWorkspaceRepo.updatePool>[1],
      );
      break;
    case "upsertPoolMember":
      await cloudWorkspaceRepo.upsertPoolMember(
        row.tripId,
        String(p.poolId),
        String(p.participantId),
        p.existing as PoolMemberRow | undefined,
        p.patch as Parameters<typeof cloudWorkspaceRepo.upsertPoolMember>[4],
      );
      break;
    case "addExpense":
      await cloudWorkspaceRepo.addExpense(
        row.tripId,
        p.row as ExpenseRow,
        (p.splits as ExpenseSplitRow[]) ?? [],
      );
      break;
    case "reviseExpense":
      // Keep-both: revise creates a new expense row (domain supersede).
      await cloudWorkspaceRepo.reviseExpense(
        String(p.oldExpenseId),
        p.row as ExpenseRow,
        (p.splits as ExpenseSplitRow[]) ?? [],
      );
      break;
    case "voidExpense":
      await cloudWorkspaceRepo.voidExpense(
        String(p.expenseId),
        String(p.tripId ?? row.tripId),
      );
      break;
    case "addAdjustment":
      await cloudWorkspaceRepo.addAdjustment(p.row as AdjustmentRow);
      break;
    case "updateAdjustment":
      await cloudWorkspaceRepo.updateAdjustment(
        String(p.id),
        p.patch as Parameters<typeof cloudWorkspaceRepo.updateAdjustment>[1],
      );
      break;
    case "removeAdjustments":
      await cloudWorkspaceRepo.removeAdjustments((p.ids as string[]) ?? []);
      break;
    case "updateSettlementSettings":
      await cloudWorkspaceRepo.updateSettlementSettings(
        row.tripId,
        p.patch as Parameters<typeof cloudWorkspaceRepo.updateSettlementSettings>[1],
      );
      break;
    default:
      throw new Error(`Unknown outbox op: ${row.op}`);
  }
}

/**
 * addParticipant/addPool in cloud repo mint new ids — for offline we must push
 * the already-created rows. Use direct API helpers when payload includes rows.
 */
async function applyOutboxRowPrecise(row: OutboxRow): Promise<void> {
  const p = row.payload as Record<string, unknown>;

  if (row.op === "addParticipant" && p.participant && p.members) {
    const { apiMutate } = await import("@/api/client");
    const { participantToDb, poolMemberToDb } = await import("@/api/mappers");
    const participant = p.participant as {
      id: string;
      tripId: string;
      displayName: string;
    };
    const members = p.members as PoolMemberRow[];
    await apiMutate((sb) =>
      sb.rpc("add_participant_with_pool_members", {
        p_participant: participantToDb(participant),
        p_members: members.map(poolMemberToDb),
      }),
    );
    return;
  }

  if (row.op === "addPool" && p.pool && p.members) {
    const poolsApi = await import("@/api/pools");
    const { poolToDb, poolMemberToDb } = await import("@/api/mappers");
    const pool = p.pool as {
      id: string;
      tripId: string;
      name: string;
      splitMode: "shares" | "equal" | "percent" | "exact";
    };
    const members = p.members as PoolMemberRow[];
    await poolsApi.insertPool(poolToDb(pool));
    for (const m of members) {
      await poolsApi.insertPoolMember(poolMemberToDb(m));
    }
    return;
  }

  if (row.op === "createTrip" && p.trip) {
    const trip = p.trip as TripRow;
    const participantId = String(p.participantId ?? newId("p"));
    await tripsApi.createTripWithIds(trip.id, participantId, trip.name, {
      transferMode: trip.transferMode,
      settlementRounding: trip.settlementRounding,
    });
    return;
  }

  if (row.op === "upsertPoolMember" && p.row && !p.existing) {
    const poolsApi = await import("@/api/pools");
    const { poolMemberToDb } = await import("@/api/mappers");
    await poolsApi.insertPoolMember(poolMemberToDb(p.row as PoolMemberRow));
    return;
  }

  await applyOutboxRow(row);
}

export async function pullTrip(tripId: string): Promise<void> {
  if (!isOnline()) return;
  const userId = await requireUser();
  const before = await readCachedWorkspace(tripId, userId);
  const snapshot = await loadWorkspace(tripId);
  await writeCachedWorkspace(userId, snapshot);
  if (before?.expenses.length && snapshot.expenses.length) {
    const beforeIds = new Set(before.expenses.map((e) => e.id));
    const added = snapshot.expenses.some((e) => !beforeIds.has(e.id));
    if (
      added &&
      before.expenses.some((e) => !snapshot.expenses.find((s) => s.id === e.id) === false)
    ) {
      // Remote brought additional rows while we also had local — keep-both already in DB merge via replace.
    }
    // After writeCachedWorkspace we replace with server. Pending outbox creates still flush afterward (keep both).
    if (added) noteKeepBothMerge();
  }
}

export async function flushOutbox(tripId?: string): Promise<void> {
  if (!isOnline()) {
    setOnline(false);
    await refreshPendingCount();
    return;
  }
  setOnline(true);

  if (flushPromise) {
    await flushPromise;
    return;
  }

  flushPromise = (async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const rows = await listOutbox(tripId);
      for (const row of rows) {
        try {
          await applyOutboxRowPrecise(row);
          await removeOutbox(row.id);
          if (row.tripId && row.op !== "deleteTrip") {
            try {
              await pullTrip(row.tripId);
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
    } finally {
      setSyncing(false);
      flushPromise = null;
    }
  })();

  await flushPromise;
}

export async function syncTrip(tripId: string): Promise<void> {
  await flushOutbox(tripId);
  if (isOnline()) {
    try {
      await pullTrip(tripId);
      setSyncError(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Pull failed";
      setSyncError(message);
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

  const { getSession, isSupabaseConfigured } = await import("@/api/supabase");
  if (!isSupabaseConfigured()) {
    await refreshPendingCount();
    return;
  }
  const session = await getSession();
  if (!session?.user || session.user.is_anonymous) {
    await refreshPendingCount();
    return;
  }

  setSyncing(true);
  try {
    await flushOutbox();
    const user = session.user;
    const remote = await tripsApi.listTrips();
    const remoteIds = new Set(remote.map((t) => t.id));
    for (const trip of remote) {
      await writeCachedWorkspace(user.id, await loadWorkspace(trip.id));
    }
    const cached = await listCachedCloudTrips(user.id);
    for (const trip of cached) {
      if (!remoteIds.has(trip.id)) {
        // Keep local pending creates; otherwise drop stale cache.
        const pending = await listOutbox(trip.id);
        if (!pending.length) await deleteCachedTrip(trip.id);
      }
    }
    setSyncError(null);
  } catch (e) {
    setSyncError(e instanceof Error ? e.message : "Sync failed");
  } finally {
    setSyncing(false);
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
