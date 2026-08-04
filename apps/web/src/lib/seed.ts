import { rupeesToPaisa } from "@tripledger/engine";
import { db, type ExpenseRow, newId, type PoolMemberRow } from "@/db/dexie";

function pm(
  tripId: string,
  poolId: string,
  participantId: string,
  shares: number,
  included = true,
): PoolMemberRow {
  return {
    id: newId("pm"),
    tripId,
    poolId,
    participantId,
    included,
    shares: Math.max(1, shares),
    percentBps: 0,
    exactPaisa: 0,
  };
}

/** Seed the known sample trip with synthetic expense lines. */
export async function seedSampleTrip(): Promise<string> {
  const now = new Date().toISOString();
  const tripId = newId("trip");
  const bilal = newId("p");
  const mamo = newId("p");
  const salman = newId("p");
  const farhan = newId("p");
  const partA = newId("pool");
  const partB = newId("pool");

  await db.transaction(
    "rw",
    [db.trips, db.participants, db.pools, db.poolMembers, db.expenses, db.adjustments],
    async () => {
      await db.trips.add({
        id: tripId,
        name: "Sample Trip (Abbottabad)",
        currency: "PKR",
        createdAt: now,
        updatedAt: now,
        transferMode: "minimize",
        settlementRounding: "rupee",
        settlementHubId: null,
      });

      await db.participants.bulkAdd([
        { id: bilal, tripId, displayName: "Bilal" },
        { id: mamo, tripId, displayName: "Mamo" },
        { id: salman, tripId, displayName: "Salman" },
        { id: farhan, tripId, displayName: "Farhan" },
      ]);

      await db.pools.bulkAdd([
        { id: partA, tripId, name: "Part A", splitMode: "shares" },
        { id: partB, tripId, name: "Part B", splitMode: "shares" },
      ]);

      await db.poolMembers.bulkAdd([
        pm(tripId, partA, bilal, 6),
        pm(tripId, partA, mamo, 6),
        pm(tripId, partA, salman, 3),
        pm(tripId, partA, farhan, 1, false),
        pm(tripId, partB, bilal, 6),
        pm(tripId, partB, mamo, 6),
        pm(tripId, partB, salman, 3),
        pm(tripId, partB, farhan, 2),
      ]);

      const mk = (
        poolId: string,
        description: string,
        category: string,
        amount: number,
        paidById: string,
      ): ExpenseRow => ({
        id: newId("exp"),
        tripId,
        poolId,
        description,
        category,
        amountPaisa: rupeesToPaisa(amount),
        paidById,
        date: now.slice(0, 10),
        notes: "Synthetic seed",
        supersededById: null,
        createdAt: now,
        splitMode: null,
      });

      await db.expenses.bulkAdd([
        mk(partA, "Fuel", "Fuel", 12_000, bilal),
        mk(partA, "Breakfast", "Food", 4_600, bilal),
        mk(partA, "Hotel A", "Hotel", 18_800, bilal),
        mk(partA, "Misc A", "Misc", 10_000, bilal),
        mk(partB, "Hotel B", "Hotel", 9_800, bilal),
        mk(partB, "Lunch", "Food", 2_800, bilal),
        mk(partB, "Shopping", "Shopping", 11_000, mamo),
        mk(partB, "Toll", "Toll", 5_000, salman),
        mk(partB, "Snacks", "Food", 3_000, farhan),
      ]);

      await db.adjustments.bulkAdd([
        {
          id: newId("adj"),
          tripId,
          fromId: bilal,
          toId: salman,
          amountPaisa: rupeesToPaisa(9_000),
          reason: "Old payment",
          createdAt: now,
        },
        {
          id: newId("adj"),
          tripId,
          fromId: mamo,
          toId: bilal,
          amountPaisa: rupeesToPaisa(1_175),
          reason: "BBQ remainder",
          createdAt: now,
        },
      ]);
    },
  );

  return tripId;
}
