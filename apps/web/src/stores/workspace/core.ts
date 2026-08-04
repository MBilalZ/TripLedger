import { computed } from "vue";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { settleTrip } from "@tripledger/engine";
import type { SettlementRounding, TransferMode } from "@tripledger/types";
import { subscribeTripChanges, unsubscribeChannel } from "@/api/realtime";
import { mapToTripFacts } from "@/lib/mapToTripFacts";
import { getWorkspaceRepo } from "@/repositories";
import { useAuthStore } from "@/stores/auth";
import type { WorkspaceState } from "./state";

export function createCoreActions(state: WorkspaceState) {
  const auth = useAuthStore();
  let realtimeChannel: RealtimeChannel | null = null;

  function recomputeSettlement() {
    if (!state.trip.value) {
      state.settlement.value = null;
      return;
    }
    state.settlement.value = settleTrip(
      mapToTripFacts({
        trip: state.trip.value,
        participants: state.participants.value,
        pools: state.pools.value,
        poolMembers: state.poolMembers.value,
        expenses: state.expenses.value,
        expenseSplits: state.expenseSplits.value,
        adjustments: state.adjustments.value,
      }),
    );
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
      void reload({ quiet: true });
    });
  }

  function teardownRealtime() {
    unsubscribeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  async function bindTrip(id: string) {
    state.tripId.value = id;
    await reload();
    subscribeRealtime();
  }

  async function updateTrip(patch: { name?: string; currency?: string }) {
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
