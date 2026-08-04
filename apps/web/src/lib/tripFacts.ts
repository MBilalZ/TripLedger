import type { TripFacts } from "@tripledger/types";
import { DEFAULT_TRIP_SETTINGS } from "@tripledger/types";
import { db } from "@/db/dexie";

export async function loadTripFacts(tripId: string): Promise<TripFacts> {
  const trip = await db.trips.get(tripId);
  const [participants, pools, poolMembers, expenses, expenseSplits, adjustments] =
    await Promise.all([
      db.participants.where("tripId").equals(tripId).toArray(),
      db.pools.where("tripId").equals(tripId).toArray(),
      db.poolMembers.where("tripId").equals(tripId).toArray(),
      db.expenses
        .where("tripId")
        .equals(tripId)
        .filter((e) => !e.supersededById)
        .toArray(),
      db.expenseSplits.where("tripId").equals(tripId).toArray(),
      db.adjustments.where("tripId").equals(tripId).toArray(),
    ]);

  return {
    participants: participants.map((p) => ({
      id: p.id,
      displayName: p.displayName,
    })),
    pools: pools.map((p) => ({
      id: p.id,
      name: p.name,
      splitMode: p.splitMode ?? "shares",
    })),
    poolMembers: poolMembers.map((m) => ({
      poolId: m.poolId,
      participantId: m.participantId,
      included: m.included ?? (m.headCount ?? m.shares ?? 0) > 0,
      shares: Math.max(1, m.shares ?? m.headCount ?? 1),
      percentBps: m.percentBps ?? 0,
      exactPaisa: m.exactPaisa ?? 0,
    })),
    expenses: expenses.map((e) => ({
      id: e.id,
      poolId: e.poolId,
      description: e.description,
      category: e.category,
      amountPaisa: e.amountPaisa,
      paidById: e.paidById,
      date: e.date,
      notes: e.notes,
      supersededById: e.supersededById,
      splitMode: e.splitMode ?? null,
    })),
    expenseSplits: expenseSplits.map((s) => ({
      expenseId: s.expenseId,
      participantId: s.participantId,
      included: s.included,
      shares: s.shares,
      percentBps: s.percentBps,
      exactPaisa: s.exactPaisa,
    })),
    adjustments: adjustments.map((a) => ({
      id: a.id,
      fromId: a.fromId,
      toId: a.toId,
      amountPaisa: a.amountPaisa,
      reason: a.reason,
    })),
    settings: {
      transferMode: trip?.transferMode ?? DEFAULT_TRIP_SETTINGS.transferMode,
      settlementRounding:
        trip?.settlementRounding ?? DEFAULT_TRIP_SETTINGS.settlementRounding,
      settlementHubId:
        trip?.settlementHubId ?? DEFAULT_TRIP_SETTINGS.settlementHubId,
    },
  };
}
