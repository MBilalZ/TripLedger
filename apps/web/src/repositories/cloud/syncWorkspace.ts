import { db } from "@/db/dexie";
import { requireUser } from "@/services/supabase";
import { readCachedWorkspace, writeCachedWorkspace } from "@/sync/cache";
import { flushOutbox, syncTrip } from "@/sync/engine";
import { enqueueOutbox, listOutbox } from "@/sync/outbox";
import { getSyncError } from "@/sync/status";
import { localWorkspaceRepo } from "../local/workspace";
import type { WorkspaceRepo } from "../types";
import { cloudWorkspaceRepo } from "./workspace";

function online(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

async function tryFlush(tripId: string): Promise<{ ok: boolean; error?: string }> {
  if (!online()) return { ok: true };
  try {
    await flushOutbox(tripId);
    const pending = await listOutbox(tripId);
    if (pending.length) {
      return {
        ok: false,
        error: getSyncError() ?? pending[0]?.lastError ?? "Sync still pending",
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Sync failed",
    };
  }
}

export const syncCloudWorkspaceRepo: WorkspaceRepo = {
  async load(tripId) {
    const user = await requireUser();
    const cached = await readCachedWorkspace(tripId, user);

    if (!online()) {
      if (cached) return cached;
      throw new Error("You are offline and this trip is not cached yet");
    }

    try {
      await syncTrip(tripId);
      const fresh = await readCachedWorkspace(tripId, user);
      if (fresh) return fresh;
      const remote = await cloudWorkspaceRepo.load(tripId);
      await writeCachedWorkspace(user, remote);
      return remote;
    } catch (e) {
      if (cached) return cached;
      throw e;
    }
  },

  async touch(tripId) {
    await db.trips.update(tripId, { updatedAt: new Date().toISOString() });
    await enqueueOutbox(tripId, "touchTrip", {});
    await tryFlush(tripId);
  },

  async addParticipant(tripId, displayName, pools) {
    const result = await localWorkspaceRepo.addParticipant(tripId, displayName, pools);
    await enqueueOutbox(tripId, "addParticipant", {
      displayName,
      pools,
      participant: result.participant,
      members: result.members,
    });
    await tryFlush(tripId);
    return result;
  },

  async removeParticipant(participantId) {
    const row = await db.participants.get(participantId);
    const tripId = row?.tripId ?? "";
    await localWorkspaceRepo.removeParticipant(participantId);
    if (tripId) {
      await enqueueOutbox(tripId, "removeParticipant", { participantId });
      await tryFlush(tripId);
    }
  },

  async updateParticipant(id, displayName) {
    const row = await db.participants.get(id);
    await localWorkspaceRepo.updateParticipant(id, displayName);
    if (row?.tripId) {
      await enqueueOutbox(row.tripId, "updateParticipant", {
        id,
        displayName,
      });
      await tryFlush(row.tripId);
    }
  },

  async updateTrip(tripId, patch) {
    const updates = await localWorkspaceRepo.updateTrip(tripId, patch);
    await enqueueOutbox(tripId, "updateTrip", { patch });
    await tryFlush(tripId);
    return updates;
  },

  async addPool(tripId, name, participants) {
    const result = await localWorkspaceRepo.addPool(tripId, name, participants);
    await enqueueOutbox(tripId, "addPool", {
      name,
      participants,
      pool: result.pool,
      members: result.members,
    });
    const flush = await tryFlush(tripId);
    if (!flush.ok) {
      const pending = await listOutbox(tripId);
      const stillHere = pending.some((row) => {
        if (row.op !== "addPool") return false;
        const pool = (row.payload as { pool?: { id?: string } }).pool;
        return pool?.id === result.pool.id;
      });
      if (stillHere) {
        throw new Error(flush.error ?? "Pool saved locally but sync failed");
      }
    }
    return result;
  },

  async removePool(poolId) {
    const pool = await db.pools.get(poolId);
    await localWorkspaceRepo.removePool(poolId);
    if (pool?.tripId) {
      await enqueueOutbox(pool.tripId, "removePool", { poolId });
      await tryFlush(pool.tripId);
    }
  },

  async updatePool(id, patch) {
    const updates = await localWorkspaceRepo.updatePool(id, patch);
    const pool = await db.pools.get(id);
    if (pool?.tripId) {
      await enqueueOutbox(pool.tripId, "updatePool", { id, patch });
      await tryFlush(pool.tripId);
    }
    return updates;
  },

  async upsertPoolMember(tripId, poolId, participantId, existing, patch) {
    const row = await localWorkspaceRepo.upsertPoolMember(
      tripId,
      poolId,
      participantId,
      existing,
      patch,
    );
    await enqueueOutbox(tripId, "upsertPoolMember", {
      poolId,
      participantId,
      existing,
      patch,
      row,
    });
    await tryFlush(tripId);
    return row;
  },

  async addExpense(tripId, row, splits) {
    await localWorkspaceRepo.addExpense(tripId, row, splits);
    await enqueueOutbox(tripId, "addExpense", { row, splits });
    await tryFlush(tripId);
  },

  async reviseExpense(oldExpenseId, row, splits) {
    // Keep-both: revise adds a new expense and supersedes the old one.
    await localWorkspaceRepo.reviseExpense(oldExpenseId, row, splits);
    await enqueueOutbox(row.tripId, "reviseExpense", {
      oldExpenseId,
      row,
      splits,
    });
    await tryFlush(row.tripId);
  },

  async voidExpense(expenseId, tripIdOrVoidId) {
    await localWorkspaceRepo.voidExpense(expenseId, tripIdOrVoidId);
    const tripId = tripIdOrVoidId;
    await enqueueOutbox(tripId, "voidExpense", { expenseId, tripId });
    await tryFlush(tripId);
  },

  async addAdjustment(row) {
    await localWorkspaceRepo.addAdjustment(row);
    await enqueueOutbox(row.tripId, "addAdjustment", { row });
    await tryFlush(row.tripId);
  },

  async updateAdjustment(id, patch) {
    const existing = await db.adjustments.get(id);
    await localWorkspaceRepo.updateAdjustment(id, patch);
    if (existing?.tripId) {
      await enqueueOutbox(existing.tripId, "updateAdjustment", { id, patch });
      await tryFlush(existing.tripId);
    }
  },

  async removeAdjustments(ids) {
    const first = ids[0] ? await db.adjustments.get(ids[0]) : null;
    await localWorkspaceRepo.removeAdjustments(ids);
    if (first?.tripId) {
      await enqueueOutbox(first.tripId, "removeAdjustments", { ids });
      await tryFlush(first.tripId);
    }
  },

  async updateSettlementSettings(tripId, patch) {
    const updatedAt = await localWorkspaceRepo.updateSettlementSettings(tripId, patch);
    await enqueueOutbox(tripId, "updateSettlementSettings", { patch });
    await tryFlush(tripId);
    return updatedAt;
  },
};
