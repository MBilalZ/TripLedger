import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { TripRow } from "@/db/dexie";
import { seedSampleTrip } from "@/lib/seed";
import { type CreateTripOptions, getTripRepos } from "@/repositories";
import { useAuthStore } from "./auth";

export type { CreateTripOptions };

export const useTripsStore = defineStore("trips", () => {
  const auth = useAuthStore();
  const trips = ref<TripRow[]>([]);
  const loading = ref(false);

  const cloud = computed(() => auth.cloud);
  const authReady = computed(() => auth.authReady);
  const authError = computed(() => auth.authError);

  async function refresh() {
    loading.value = true;
    try {
      trips.value = await getTripRepos().list();
    } finally {
      loading.value = false;
    }
  }

  async function createTrip(name: string, options: CreateTripOptions = {}) {
    const id = await getTripRepos().create(name, options);
    await refresh();
    return id;
  }

  async function deleteTrip(tripId: string) {
    await getTripRepos().delete(tripId);
    await refresh();
  }

  async function touch(tripId: string) {
    await getTripRepos().touch(tripId);
  }

  async function seedSample() {
    if (auth.cloud) {
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
    initAuth: () => auth.initAuth(),
    refresh,
    createTrip,
    deleteTrip,
    touch,
    seedSample,
  };
});
