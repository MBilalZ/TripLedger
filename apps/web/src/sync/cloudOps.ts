/**
 * Cloud-only sync helpers. Loaded via dynamic import from `engine.ts`
 * so the sync entrypoint does not mix static/dynamic imports of api modules.
 */
import { apiMutate } from "@/api/client";
import { participantToDb, poolMemberToDb, poolToDb } from "@/api/mappers";
import * as poolsApi from "@/api/pools";
import { getSession, isSupabaseConfigured, requireUser } from "@/api/supabase";
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
import { cloudWorkspaceRepo } from "@/repositories/cloud/workspace";
import {
  deleteCachedTrip,
  listCachedCloudTrips,
  readCachedWorkspace,
  reapplyPendingOutboxToCache,
  writeCachedWorkspace,
} from "./cache";
import { listOutbox, pendingDeleteTripIds } from "./outbox";
import { noteKeepBothMerge } from "./status";

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
    case "deleteTrip": {
      const mode = p.mode === "leave" ? "leave" : "delete";
      if (mode === "leave") await tripsApi.leaveTrip(row.tripId);
      else await tripsApi.deleteTrip(row.tripId);
      await deleteCachedTrip(row.tripId);
      break;
    }
    case "touchTrip":
      await tripsApi.touchTrip(row.tripId);
      break;
    case "addParticipant":
      await cloudWorkspaceRepo.addParticipant(
        row.tripId,
        String(p.displayName),
        (p.pools as Parameters<typeof cloudWorkspaceRepo.addParticipant>[2]) ?? [],
      );
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

/** Apply outbox row, preferring payload ids when present (offline keep-both). */
export async function applyOutboxRowPrecise(row: OutboxRow): Promise<void> {
  const p = row.payload as Record<string, unknown>;

  if (row.op === "addParticipant" && p.participant && p.members) {
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
    const pool = p.pool as {
      id: string;
      tripId: string;
      name: string;
      splitMode: "shares" | "equal" | "percent" | "exact";
    };
    const members = p.members as PoolMemberRow[];
    await apiMutate((sb) =>
      sb.rpc("add_pool_with_members", {
        p_pool: poolToDb(pool),
        p_members: members.map(poolMemberToDb),
      }),
    );
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
    await poolsApi.insertPoolMember(poolMemberToDb(p.row as PoolMemberRow));
    return;
  }

  await applyOutboxRow(row);
}

export async function pullTrip(tripId: string): Promise<void> {
  const userId = await requireUser();
  const before = await readCachedWorkspace(tripId, userId);
  const snapshot = await loadWorkspace(tripId);
  await writeCachedWorkspace(userId, snapshot);
  await reapplyPendingOutboxToCache(tripId);
  if (before?.expenses.length && snapshot.expenses.length) {
    const beforeIds = new Set(before.expenses.map((e) => e.id));
    const added = snapshot.expenses.some((e) => !beforeIds.has(e.id));
    if (added) noteKeepBothMerge();
  }
}

export async function syncAllCloudTripsWork(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const session = await getSession();
  if (!session?.user || session.user.is_anonymous) return;

  const user = session.user;
  const remote = await tripsApi.listTrips();
  const remoteIds = new Set(remote.map((t) => t.id));
  const pendingDeletes = await pendingDeleteTripIds();
  for (const trip of remote) {
    if (pendingDeletes.has(trip.id)) continue;
    await writeCachedWorkspace(user.id, await loadWorkspace(trip.id));
    await reapplyPendingOutboxToCache(trip.id);
  }
  const cached = await listCachedCloudTrips(user.id);
  for (const trip of cached) {
    if (pendingDeletes.has(trip.id)) continue;
    if (!remoteIds.has(trip.id)) {
      const pending = await listOutbox(trip.id);
      if (!pending.length) await deleteCachedTrip(trip.id);
    }
  }
}
