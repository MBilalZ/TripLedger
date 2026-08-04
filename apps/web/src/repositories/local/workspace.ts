import {
  db,
  newId,
  type ParticipantRow,
  type PoolMemberRow,
  type PoolRow,
  type TripRow,
} from "@/db/dexie";
import type { WorkspaceRepo } from "../types";

export const localWorkspaceRepo: WorkspaceRepo = {
  async load(tripId) {
    const trip = (await db.trips.get(tripId)) ?? null;
    const [
      participants,
      pools,
      poolMembers,
      expenses,
      expenseSplits,
      adjustments,
    ] = await Promise.all([
      db.participants.where("tripId").equals(tripId).toArray(),
      db.pools.where("tripId").equals(tripId).toArray(),
      db.poolMembers.where("tripId").equals(tripId).toArray(),
      db.expenses
        .where("tripId")
        .equals(tripId)
        .filter((e) => !e.supersededById)
        .sortBy("createdAt"),
      db.expenseSplits.where("tripId").equals(tripId).toArray(),
      db.adjustments.where("tripId").equals(tripId).toArray(),
    ]);
    return {
      trip,
      participants,
      pools,
      poolMembers,
      expenses,
      expenseSplits,
      adjustments,
    };
  },

  async touch(tripId) {
    await db.trips.update(tripId, { updatedAt: new Date().toISOString() });
  },

  async addParticipant(tripId, displayName, pools) {
    const name = displayName.trim();
    if (!name) throw new Error("Name is required");
    const participant: ParticipantRow = {
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
    await db.participants.add(participant);
    if (members.length) await db.poolMembers.bulkAdd(members);
    return { participant, members };
  },

  async removeParticipant(participantId) {
    await db.transaction(
      "rw",
      [db.participants, db.poolMembers, db.expenseSplits],
      async () => {
        await db.participants.delete(participantId);
        await db.poolMembers.where("participantId").equals(participantId).delete();
        await db.expenseSplits
          .where("participantId")
          .equals(participantId)
          .delete();
      },
    );
  },

  async updateParticipant(id, displayName) {
    const name = displayName.trim();
    if (!name) throw new Error("Name is required");
    await db.participants.update(id, { displayName: name });
  },

  async updateTrip(tripId, patch) {
    const updates: Partial<TripRow> = {
      updatedAt: new Date().toISOString(),
    };
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw new Error("Trip name is required");
      updates.name = name;
    }
    if (patch.currency !== undefined) updates.currency = "PKR";
    await db.trips.update(tripId, updates);
    return updates;
  },

  async addPool(tripId, name, participants) {
    const n = name.trim();
    if (!n) throw new Error("Pool name is required");
    if (!participants.length) {
      throw new Error("Add at least one person before creating a pool");
    }
    const pool: PoolRow = {
      id: newId("pool"),
      tripId,
      name: n,
      splitMode: "shares",
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
    await db.pools.add(pool);
    if (members.length) await db.poolMembers.bulkAdd(members);
    return { pool, members };
  },

  async removePool(poolId) {
    await db.transaction("rw", [db.pools, db.poolMembers], async () => {
      await db.pools.delete(poolId);
      await db.poolMembers.where("poolId").equals(poolId).delete();
    });
  },

  async updatePool(id, patch) {
    const updates: Partial<PoolRow> = {};
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw new Error("Pool name is required");
      updates.name = name;
    }
    if (patch.splitMode !== undefined) updates.splitMode = patch.splitMode;
    await db.pools.update(id, updates);
    return updates;
  },

  async upsertPoolMember(tripId, poolId, participantId, existing, patch) {
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    ) as typeof patch;

    if (existing) {
      if (Object.keys(clean).length) {
        await db.poolMembers.update(existing.id, clean);
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
    await db.poolMembers.add(row);
    return row;
  },

  async addExpense(_tripId, row, splits) {
    await db.transaction("rw", [db.expenses, db.expenseSplits], async () => {
      await db.expenses.add(row);
      if (splits.length) await db.expenseSplits.bulkAdd(splits);
    });
  },

  async reviseExpense(oldExpenseId, row, splits) {
    await db.transaction("rw", [db.expenses, db.expenseSplits], async () => {
      await db.expenses.add(row);
      await db.expenses.update(oldExpenseId, { supersededById: row.id });
      await db.expenseSplits.where("expenseId").equals(oldExpenseId).delete();
      if (splits.length) await db.expenseSplits.bulkAdd(splits);
    });
  },

  async voidExpense(expenseId, voidId) {
    await db.transaction("rw", [db.expenses, db.expenseSplits], async () => {
      await db.expenses.update(expenseId, { supersededById: voidId });
      await db.expenseSplits.where("expenseId").equals(expenseId).delete();
    });
  },

  async addAdjustment(row) {
    await db.adjustments.add(row);
  },

  async updateAdjustment(id, patch) {
    await db.adjustments.update(id, patch);
  },

  async removeAdjustments(ids) {
    for (const id of ids) await db.adjustments.delete(id);
  },

  async updateSettlementSettings(tripId, patch) {
    const updatedAt = new Date().toISOString();
    await db.trips.update(tripId, { ...patch, updatedAt });
    return updatedAt;
  },
};
