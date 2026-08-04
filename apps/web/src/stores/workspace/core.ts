import { computed } from "vue";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { settleTrip } from "@tripledger/engine";
import type { SettlementRounding, TransferMode } from "@tripledger/types";
import { subscribeTripChanges, unsubscribeChannel } from "@/api/realtime";
import {
  hashTripFacts,
  recomputeSettlementRemote,
  upsertSettlementSnapshot,
} from "@/api/settlement";
import { mapToTripFacts } from "@/lib/mapToTripFacts";
import { getWorkspaceRepo } from "@/repositories";
import { useAuthStore } from "@/stores/auth";
import type { WorkspaceState } from "./state";

export function createCoreActions(state: WorkspaceState) {
  const auth = useAuthStore();
  let realtimeChannel: RealtimeChannel | null = null;
  let reloadTimer: ReturnType<typeof setTimeout> | null = null;
  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  function currentFacts() {
    return mapToTripFacts({
      trip: state.trip.value,
      participants: state.participants.value,
      pools: state.pools.value,
      poolMembers: state.poolMembers.value,
      expenses: state.expenses.value,
      expenseSplits: state.expenseSplits.value,
      adjustments: state.adjustments.value,
    });
  }

  function recomputeSettlement() {
    if (!state.trip.value) {
      state.settlement.value = null;
      return;
    }
    state.settlement.value = settleTrip(currentFacts());
    schedulePersistSnapshot();
  }

  function schedulePersistSnapshot() {
    if (!auth.cloud || !state.settlement.value) return;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = null;
      void persistSettlementSnapshot();
    }, 500);
  }

  async function persistSettlementSnapshot() {
    if (!auth.cloud || !state.trip.value || !state.settlement.value) return;
    try {
      const remote = await recomputeSettlementRemote(state.tripId.value);
      if (remote) {
        state.settlement.value = remote;
        return;
      }
      const facts = currentFacts();
      const hash = await hashTripFacts(facts);
      await upsertSettlementSnapshot(
        state.tripId.value,
        hash,
        state.settlement.value,
      );
    } catch {
      // Snapshot persistence is best-effort; local settlement remains usable.
    }
  }

  function scheduleQuietReload() {
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      reloadTimer = null;
      void reload({ quiet: true });
    }, 300);
  }

  async function touch() {
    const id = state.tripId.value;
    await getWorkspaceRepo().touch(id);
    if (state.trip.value) {
      state.trip.value = {
        ...state.trip.value,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  async function reload(opts: { quiet?: boolean } = {}) {
    if (!opts.quiet) state.loading.value = true;
    try {
      const data = await getWorkspaceRepo().load(state.tripId.value);
      state.applySnapshot(data);
      recomputeSettlement();
    } finally {
      if (!opts.quiet) state.loading.value = false;
    }
  }

  function subscribeRealtime() {
    unsubscribeChannel(realtimeChannel);
    realtimeChannel = null;
    if (!auth.cloud) return;
    realtimeChannel = subscribeTripChanges(state.tripId.value, () => {
      scheduleQuietReload();
    });
  }

  function teardownRealtime() {
    if (reloadTimer) {
      clearTimeout(reloadTimer);
      reloadTimer = null;
    }
    unsubscribeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  async function bindTrip(id: string) {
    state.tripId.value = id;
    await reload();
    subscribeRealtime();
  }

  async function updateTrip(patch: { name?: string }) {
    if (state.myRole.value !== "owner" && useAuthStore().cloud) {
      throw new Error("Only the trip owner can rename the trip");
    }
    const updates = await getWorkspaceRepo().updateTrip(
      state.tripId.value,
      patch,
    );
    if (state.trip.value) state.trip.value = { ...state.trip.value, ...updates };
    recomputeSettlement();
    state.announce("Trip updated");
  }

  async function updateSettlementSettings(patch: {
    transferMode?: TransferMode;
    settlementRounding?: SettlementRounding;
    settlementHubId?: string | null;
  }) {
    if (state.myRole.value !== "owner" && useAuthStore().cloud) {
      throw new Error("Only the trip owner can change settlement settings");
    }
    const updatedAt = await getWorkspaceRepo().updateSettlementSettings(
      state.tripId.value,
      patch,
    );
    if (state.trip.value) {
      state.trip.value = { ...state.trip.value, ...patch, updatedAt };
    }
    recomputeSettlement();
    state.announce("Settlement settings updated");
  }

  const participantName = computed(() => {
    const m = new Map(
      state.participants.value.map((p) => [p.id, p.displayName]),
    );
    return (id: string) => m.get(id) ?? id;
  });

  const poolName = computed(() => {
    const m = new Map(state.pools.value.map((p) => [p.id, p.name]));
    return (id: string) => m.get(id) ?? id;
  });

  return {
    recomputeSettlement,
    touch,
    reload,
    bindTrip,
    teardownRealtime,
    updateTrip,
    updateSettlementSettings,
    participantName,
    poolName,
  };
}

export type CoreActions = ReturnType<typeof createCoreActions>;
