import type { TripFacts } from "@tripledger/types";
import { db } from "@/db/dexie";
import { mapToTripFacts } from "@/lib/mapToTripFacts";

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

  return mapToTripFacts({
    trip,
    participants,
    pools,
    poolMembers,
    expenses,
    expenseSplits,
    adjustments,
  });
}
