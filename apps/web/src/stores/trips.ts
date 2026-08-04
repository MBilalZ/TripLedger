import { defineStore } from "pinia";
import { ref } from "vue";
import type { SettlementRounding, TransferMode } from "@tripledger/types";
import { db, newId, type TripRow } from "@/db/dexie";
import { seedSampleTrip } from "@/lib/seed";
import {
  cloudCreateTrip,
  cloudDeleteTrip,
  cloudListTrips,
  cloudTouchTrip,
} from "@/lib/cloud/tripsApi";
import { ensureAuthSession, isSupabaseConfigured } from "@/lib/supabase";

export type CreateTripOptions = {
  transferMode?: TransferMode;
  settlementRounding?: SettlementRounding;
};

export const useTripsStore = defineStore("trips", () => {
  const trips = ref<TripRow[]>([]);
  const loading = ref(false);
  const cloud = ref(isSupabaseConfigured());
  const authReady = ref(!isSupabaseConfigured());
  const authError = ref<string | null>(null);

  async function initAuth() {
    if (!isSupabaseConfigured()) {
      cloud.value = false;
      authReady.value = true;
      return;
    }
    try {
      await ensureAuthSession();
      cloud.value = true;
      authError.value = null;
    } catch (e) {
      authError.value =
        e instanceof Error ? e.message : "Could not sign in anonymously";
      cloud.value = false;
    } finally {
      authReady.value = true;
    }
  }

  async function refresh() {
    loading.value = true;
    try {
      if (cloud.value) {
        trips.value = await cloudListTrips();
      } else {
        trips.value = await db.trips.orderBy("updatedAt").reverse().toArray();
      }
    } finally {
      loading.value = false;
    }
  }

  async function createTrip(name: string, options: CreateTripOptions = {}) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Trip name is required");

    if (cloud.value) {
      const id = await cloudCreateTrip(trimmed, options);
      await refresh();
      return id;
    }

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
    if (cloud.value) {
      await cloudDeleteTrip(tripId);
    } else {
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
    }
    await refresh();
  }

  async function touch(tripId: string) {
    if (cloud.value) {
      await cloudTouchTrip(tripId);
      return;
    }
    await db.trips.update(tripId, { updatedAt: new Date().toISOString() });
  }

  async function seedSample() {
    if (cloud.value) {
      throw new Error("Sample seed is only available in local (Dexie) mode");
    }
    const id = await seedSampleTrip();
    await refresh();
    return id;
  }

  return {
    trips,
    loading,
    cloud,
    authReady,
    authError,
    initAuth,
    refresh,
    createTrip,
    deleteTrip,
    touch,
    seedSample,
  };
});
