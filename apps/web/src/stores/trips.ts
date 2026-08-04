import { defineStore } from "pinia";
import { ref } from "vue";
import type { SettlementRounding, TransferMode } from "@tripledger/types";
import { db, newId, type TripRow } from "@/db/dexie";
import { seedSampleTrip } from "@/lib/seed";

export type CreateTripOptions = {
  transferMode?: TransferMode;
  settlementRounding?: SettlementRounding;
};

export const useTripsStore = defineStore("trips", () => {
  const trips = ref<TripRow[]>([]);
  const loading = ref(false);

  async function refresh() {
    loading.value = true;
    try {
      trips.value = await db.trips.orderBy("updatedAt").reverse().toArray();
    } finally {
      loading.value = false;
    }
  }

  async function createTrip(name: string, options: CreateTripOptions = {}) {
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
    await refresh();
    return trip.id;
  }

  async function deleteTrip(tripId: string) {
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
    await refresh();
  }

  async function touch(tripId: string) {
    await db.trips.update(tripId, { updatedAt: new Date().toISOString() });
  }

  async function seedSample() {
    const id = await seedSampleTrip();
    await refresh();
    return id;
  }

  return { trips, loading, refresh, createTrip, deleteTrip, touch, seedSample };
});
