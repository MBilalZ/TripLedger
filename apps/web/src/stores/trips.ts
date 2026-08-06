import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { db, type TripRow } from "@/db/dexie";
import { seedSampleTrip } from "@/lib/seed";
import {
  type CreateTripOptions,
  getTripRepos,
  type LeaveTripResult,
} from "@/repositories";
import { useAuthStore } from "./auth";

export type { CreateTripOptions, LeaveTripResult };

export const useTripsStore = defineStore("trips", () => {
  const auth = useAuthStore();
  const trips = ref<TripRow[]>([]);
  const tripRoles = ref<Record<string, "owner" | "member" | null>>({});
  const loading = ref(false);
  let revalidateTimer: ReturnType<typeof setTimeout> | null = null;

  const cloud = computed(() => auth.cloud);
  const authReady = computed(() => auth.authReady);
  const authError = computed(() => auth.authError);

  async function loadRoles(ids: string[]) {
    const next: Record<string, "owner" | "member" | null> = {};
    if (!ids.length) {
      tripRoles.value = next;
      return;
    }
    const metas = await db.syncMeta.bulkGet(ids);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]!;
      const role = metas[i]?.myRole ?? null;
      next[id] = role === "owner" || role === "member" ? role : null;
    }
    tripRoles.value = next;
  }

  async function applyList() {
    trips.value = await getTripRepos().list();
    if (auth.cloud) await loadRoles(trips.value.map((t) => t.id));
    else tripRoles.value = {};
  }

  function scheduleRevalidate() {
    if (!auth.cloud) return;
    if (revalidateTimer) clearTimeout(revalidateTimer);
    revalidateTimer = setTimeout(() => {
      revalidateTimer = null;
      void import("@/sync/engine").then(({ syncAllCloudTrips }) =>
        syncAllCloudTrips().then(() => refresh({ quiet: true, revalidate: false })),
      );
    }, 0);
  }

  async function refresh(opts: { quiet?: boolean; revalidate?: boolean } = {}) {
    const quiet = opts.quiet ?? trips.value.length > 0;
    const revalidate = opts.revalidate ?? true;
    if (!quiet) loading.value = true;
    try {
      await applyList();
    } finally {
      if (!quiet) loading.value = false;
    }
    if (revalidate) scheduleRevalidate();
  }

  async function createTrip(name: string, options: CreateTripOptions = {}) {
    const id = await getTripRepos().create(name, options);
    await refresh({ quiet: true });
    return id;
  }

  async function deleteTrip(tripId: string) {
    await getTripRepos().delete(tripId);
    await refresh({ quiet: true });
  }

  async function leaveTrip(tripId: string): Promise<LeaveTripResult> {
    const result = await getTripRepos().leave(tripId);
    await refresh({ quiet: true });
    return result;
  }

  async function touch(tripId: string) {
    await getTripRepos().touch(tripId);
  }

  async function seedSample() {
    if (auth.cloud) {
      throw new Error("Sample seed is only available in local (Dexie) mode");
    }
    const id = await seedSampleTrip();
    await refresh({ quiet: true, revalidate: false });
    return id;
  }

  function roleFor(tripId: string): "owner" | "member" | null {
    return tripRoles.value[tripId] ?? null;
  }

  return {
    trips,
    tripRoles,
    loading,
    cloud,
    authReady,
    authError,
    initAuth: () => auth.initAuth(),
    refresh,
    createTrip,
    deleteTrip,
    leaveTrip,
    touch,
    seedSample,
    roleFor,
  };
});
