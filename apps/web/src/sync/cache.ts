import type { WorkspaceSnapshot } from "@/api/workspace";
import {
  type AdjustmentRow,
  db,
  type ExpenseRow,
  type ExpenseSplitRow,
  type ParticipantRow,
  type PoolMemberRow,
  type PoolRow,
  type TripRow,
} from "@/db/dexie";

export async function readCachedWorkspace(
  tripId: string,
  userId: string,
): Promise<WorkspaceSnapshot | null> {
  const trip = await db.trips.get(tripId);
  if (!trip || trip.cloudUserId !== userId) return null;

  const meta = await db.syncMeta.get(tripId);
  const [participants, pools, poolMembers, expenses, expenseSplits, adjustments] =
    await Promise.all([
      db.participants.where("tripId").equals(tripId).toArray(),
      db.pools.where("tripId").equals(tripId).toArray(),
      db.poolMembers.where("tripId").equals(tripId).toArray(),
      db.expenses
        .where("tripId")
        .equals(tripId)
        .filter((e) => !e.supersededById && !e.voided)
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
    myRole: meta?.myRole ?? null,
  };
}

export async function writeCachedWorkspace(
  userId: string,
  snapshot: WorkspaceSnapshot,
): Promise<void> {
  const trip = snapshot.trip;
  if (!trip) return;

  const tripId = trip.id;
  const cloudTrip: TripRow = { ...trip, cloudUserId: userId };

  await db.transaction(
    "rw",
    [
      db.trips,
      db.participants,
      db.pools,
      db.poolMembers,
      db.expenses,
      db.expenseSplits,
      db.adjustments,
      db.syncMeta,
    ],
    async () => {
      await db.participants.where("tripId").equals(tripId).delete();
      await db.pools.where("tripId").equals(tripId).delete();
      await db.poolMembers.where("tripId").equals(tripId).delete();
      await db.expenses.where("tripId").equals(tripId).delete();
      await db.expenseSplits.where("tripId").equals(tripId).delete();
      await db.adjustments.where("tripId").equals(tripId).delete();

      await db.trips.put(cloudTrip);
      if (snapshot.participants.length) {
        await db.participants.bulkPut(snapshot.participants as ParticipantRow[]);
      }
      if (snapshot.pools.length) {
        await db.pools.bulkPut(snapshot.pools as PoolRow[]);
      }
      if (snapshot.poolMembers.length) {
        await db.poolMembers.bulkPut(snapshot.poolMembers as PoolMemberRow[]);
      }
      if (snapshot.expenses.length) {
        await db.expenses.bulkPut(snapshot.expenses as ExpenseRow[]);
      }
      if (snapshot.expenseSplits.length) {
        await db.expenseSplits.bulkPut(snapshot.expenseSplits as ExpenseSplitRow[]);
      }
      if (snapshot.adjustments.length) {
        await db.adjustments.bulkPut(snapshot.adjustments as AdjustmentRow[]);
      }

      await db.syncMeta.put({
        tripId,
        userId,
        lastPulledAt: new Date().toISOString(),
        serverUpdatedAt: trip.updatedAt,
        myRole: snapshot.myRole,
      });
    },
  );
}

export async function deleteCachedTrip(tripId: string): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.trips,
      db.participants,
      db.pools,
      db.poolMembers,
      db.expenses,
      db.expenseSplits,
      db.adjustments,
      db.receipts,
      db.syncMeta,
      db.outbox,
    ],
    async () => {
      await db.participants.where("tripId").equals(tripId).delete();
      await db.pools.where("tripId").equals(tripId).delete();
      await db.poolMembers.where("tripId").equals(tripId).delete();
      await db.expenses.where("tripId").equals(tripId).delete();
      await db.expenseSplits.where("tripId").equals(tripId).delete();
      await db.adjustments.where("tripId").equals(tripId).delete();
      await db.receipts.where("tripId").equals(tripId).delete();
      await db.outbox.where("tripId").equals(tripId).delete();
      await db.syncMeta.delete(tripId);
      await db.trips.delete(tripId);
    },
  );
}

export async function listCachedCloudTrips(userId: string): Promise<TripRow[]> {
  const rows = await db.trips.where("cloudUserId").equals(userId).sortBy("updatedAt");
  return rows.reverse();
}

/**
 * Re-apply optimistic outbox entities after a hard cache replace from remote,
 * so unpushed pools/participants are not wiped by a concurrent pull.
 */
export async function reapplyPendingOutboxToCache(tripId: string): Promise<void> {
  const pending = await db.outbox.where("tripId").equals(tripId).toArray();
  if (!pending.length) return;

  const pools: PoolRow[] = [];
  const members: PoolMemberRow[] = [];
  const participants: ParticipantRow[] = [];

  for (const row of pending) {
    const p = row.payload as Record<string, unknown>;
    if (row.op === "addPool" && p.pool) {
      pools.push(p.pool as PoolRow);
      if (Array.isArray(p.members)) {
        members.push(...(p.members as PoolMemberRow[]));
      }
    }
    if (row.op === "addParticipant" && p.participant) {
      participants.push(p.participant as ParticipantRow);
      if (Array.isArray(p.members)) {
        members.push(...(p.members as PoolMemberRow[]));
      }
    }
  }

  if (!pools.length && !members.length && !participants.length) return;

  await db.transaction(
    "rw",
    [db.pools, db.poolMembers, db.participants],
    async () => {
      if (participants.length) await db.participants.bulkPut(participants);
      if (pools.length) await db.pools.bulkPut(pools);
      if (members.length) await db.poolMembers.bulkPut(members);
    },
  );
}
