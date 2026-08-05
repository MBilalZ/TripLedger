import { db, newId, type TripRow } from "@/db/dexie";
import type { CreateTripOptions, TripListRepo } from "../types";

export const localTripListRepo: TripListRepo = {
  async list() {
    const rows = await db.trips.orderBy("updatedAt").reverse().toArray();
    // Exclude cloud-mode cache entries from device-local mode.
    return rows.filter((t) => !t.cloudUserId);
  },

  async create(name, options: CreateTripOptions = {}) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Trip name is required");
    const now = new Date().toISOString();
    const trip: TripRow = {
      id: newId("trip"),
      name: trimmed,
      currency: "PKR",
      createdAt: now,
      updatedAt: now,
      transferMode: options.transferMode ?? "minimize",
      settlementRounding: options.settlementRounding ?? "rupee",
      settlementHubId: null,
    };
    await db.trips.add(trip);
    return trip.id;
  },

  async delete(tripId) {
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
      ],
      async () => {
        await db.participants.where("tripId").equals(tripId).delete();
        await db.pools.where("tripId").equals(tripId).delete();
        await db.poolMembers.where("tripId").equals(tripId).delete();
        await db.expenses.where("tripId").equals(tripId).delete();
        await db.expenseSplits.where("tripId").equals(tripId).delete();
        await db.adjustments.where("tripId").equals(tripId).delete();
        await db.receipts.where("tripId").equals(tripId).delete();
        await db.trips.delete(tripId);
      },
    );
  },

  async leave(tripId) {
    await this.delete(tripId);
    return { action: "deleted" as const };
  },

  async touch(tripId) {
    await db.trips.update(tripId, { updatedAt: new Date().toISOString() });
  },
};
