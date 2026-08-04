import * as adjustmentsApi from "@/api/adjustments";
import * as expensesApi from "@/api/expenses";
import * as participantsApi from "@/api/participants";
import * as poolsApi from "@/api/pools";
import * as tripsApi from "@/api/trips";
import { loadWorkspace } from "@/api/workspace";
import { apiMutate } from "@/api/client";
import { newId, type PoolMemberRow, type TripRow } from "@/db/dexie";
import {
  adjustmentToDb,
  expenseSplitToDb,
  expenseToDb,
  participantToDb,
  poolMemberToDb,
  poolToDb,
} from "@/api/mappers";
import type { WorkspaceRepo } from "../types";

export const cloudWorkspaceRepo: WorkspaceRepo = {
  load: (tripId) => loadWorkspace(tripId),
  touch: (tripId) => tripsApi.touchTrip(tripId),

  async addParticipant(tripId, displayName, pools) {
    const name = displayName.trim();
    if (!name) throw new Error("Name is required");
    if (name.length > 80) throw new Error("Name must be at most 80 characters");
    const participant = {
      id: newId("p"),
      tripId,
      displayName: name,
    };
    const members: PoolMemberRow[] = pools.map((pool) => ({
      id: newId("pm"),
      tripId,
      poolId: pool.id,
      participantId: participant.id,
      included: true,
      shares: 1,
      percentBps: 0,
      exactPaisa: 0,
    }));
    await apiMutate((sb) =>
      sb.rpc("add_participant_with_pool_members", {
        p_participant: participantToDb(participant),
        p_members: members.map(poolMemberToDb),
      }),
    );
    return { participant, members };
  },

  async removeParticipant(participantId) {
    await participantsApi.deletePoolMembersByParticipant(participantId);
    await participantsApi.deleteExpenseSplitsByParticipant(participantId);
    // Drop linked membership first (owner RLS); sole-owner leave is blocked in DB.
    await participantsApi.deleteTripMembersByParticipant(participantId);
    await participantsApi.updateParticipant(participantId, {
      deleted_at: new Date().toISOString(),
    });
  },

  async updateParticipant(id, displayName) {
    const name = displayName.trim();
    if (!name) throw new Error("Name is required");
    if (name.length > 80) throw new Error("Name must be at most 80 characters");
    await participantsApi.updateParticipant(id, { display_name: name });
  },

  async updateTrip(tripId, patch) {
    const updates: Partial<TripRow> = {
      updatedAt: new Date().toISOString(),
    };
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw new Error("Trip name is required");
      if (name.length > 120) throw new Error("Trip name is too long");
      updates.name = name;
    }
    await tripsApi.updateTrip(tripId, {
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      updated_at: updates.updatedAt,
    });
    return updates;
  },

  async addPool(tripId, name, participants) {
    const n = name.trim();
    if (!n) throw new Error("Pool name is required");
    if (!participants.length) {
      throw new Error("Add at least one person before creating a pool");
    }
    const pool = {
      id: newId("pool"),
      tripId,
      name: n,
      splitMode: "shares" as const,
    };
    const members: PoolMemberRow[] = participants.map((p) => ({
      id: newId("pm"),
      tripId,
      poolId: pool.id,
      participantId: p.id,
      included: true,
      shares: 1,
      percentBps: 0,
      exactPaisa: 0,
    }));
    await poolsApi.insertPool(poolToDb(pool));
    for (const m of members) {
      await poolsApi.insertPoolMember(poolMemberToDb(m));
    }
    return { pool, members };
  },

  async removePool(poolId) {
    await poolsApi.updatePool(poolId, {
      deleted_at: new Date().toISOString(),
    });
  },

  async updatePool(id, patch) {
    const updates: { name?: string; splitMode?: typeof patch.splitMode } = {};
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw new Error("Pool name is required");
      updates.name = name;
    }
    if (patch.splitMode !== undefined) updates.splitMode = patch.splitMode;
    await poolsApi.updatePool(id, {
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.splitMode !== undefined
        ? { split_mode: updates.splitMode }
        : {}),
    });
    return updates;
  },

  async upsertPoolMember(tripId, poolId, participantId, existing, patch) {
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    ) as typeof patch;

    if (existing) {
      if (Object.keys(clean).length) {
        await poolsApi.updatePoolMember(existing.id, {
          ...(clean.included !== undefined ? { included: clean.included } : {}),
          ...(clean.shares !== undefined ? { shares: clean.shares } : {}),
          ...(clean.percentBps !== undefined
            ? { percent_bps: clean.percentBps }
            : {}),
          ...(clean.exactPaisa !== undefined
            ? { exact_paisa: clean.exactPaisa }
            : {}),
        });
      }
      return { ...existing, ...clean };
    }

    const row: PoolMemberRow = {
      id: newId("pm"),
      tripId,
      poolId,
      participantId,
      included: clean.included ?? true,
      shares: clean.shares ?? 1,
      percentBps: clean.percentBps ?? 0,
      exactPaisa: clean.exactPaisa ?? 0,
    };
    await poolsApi.insertPoolMember(poolMemberToDb(row));
    return row;
  },

  async addExpense(_tripId, row, splits) {
    await expensesApi.createExpenseWithSplits(
      expenseToDb(row),
      splits.map(expenseSplitToDb),
    );
  },

  async reviseExpense(oldExpenseId, row, splits) {
    await expensesApi.reviseExpenseWithSplits(
      oldExpenseId,
      expenseToDb(row),
      splits.map(expenseSplitToDb),
    );
  },

  async voidExpense(expenseId, tripId) {
    await expensesApi.voidExpenseRpc(expenseId, tripId);
  },

  async addAdjustment(row) {
    await adjustmentsApi.insertAdjustment(adjustmentToDb(row));
  },

  async updateAdjustment(id, patch) {
    await adjustmentsApi.updateAdjustment(id, {
      from_id: patch.fromId,
      to_id: patch.toId,
      amount_paisa: patch.amountPaisa,
      reason: patch.reason,
    });
  },

  async removeAdjustments(ids) {
    const now = new Date().toISOString();
    for (const id of ids) {
      await adjustmentsApi.updateAdjustment(id, { deleted_at: now });
    }
  },

  async updateSettlementSettings(tripId, patch) {
    const updatedAt = new Date().toISOString();
    await tripsApi.updateTrip(tripId, {
      ...(patch.transferMode !== undefined
        ? { transfer_mode: patch.transferMode }
        : {}),
      ...(patch.settlementRounding !== undefined
        ? { settlement_rounding: patch.settlementRounding }
        : {}),
      ...(patch.settlementHubId !== undefined
        ? { settlement_hub_id: patch.settlementHubId }
        : {}),
      updated_at: updatedAt,
    });
    return updatedAt;
  },
};
