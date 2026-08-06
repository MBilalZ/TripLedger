import { storeToRefs } from "pinia";
import { onUnmounted, watch } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";

/** Thin bridge: bind tripId to the workspace store and clean up on unmount. */
export function useTripWorkspace(tripId: () => string) {
  const store = useWorkspaceStore();
  const {
    trip,
    participants,
    pools,
    poolMembers,
    expenses,
    expenseSplits,
    adjustments,
    settlement,
    isOwner,
    myRole,
    loading,
    statusMessage,
    participantName,
    poolName,
  } = storeToRefs(store);

  watch(
    tripId,
    (id) => {
      if (id) void store.bindTrip(id);
    },
    { immediate: true },
  );

  onUnmounted(() => {
    store.teardownRealtime();
  });

  return {
    trip,
    participants,
    pools,
    poolMembers,
    expenses,
    expenseSplits,
    adjustments,
    settlement,
    isOwner,
    myRole,
    loading,
    statusMessage,
    participantName,
    poolName,
    reload: store.reload,
    addParticipant: store.addParticipant,
    removeParticipant: store.removeParticipant,
    updateParticipant: store.updateParticipant,
    updateTrip: store.updateTrip,
    addPool: store.addPool,
    removePool: store.removePool,
    updatePool: store.updatePool,
    setPoolSplitMode: store.setPoolSplitMode,
    upsertPoolMember: store.upsertPoolMember,
    poolMember: store.poolMember,
    addExpense: store.addExpense,
    reviseExpense: store.reviseExpense,
    removeExpense: store.removeExpense,
    addAdjustment: store.addAdjustment,
    addSplitAdjustments: store.addSplitAdjustments,
    updateAdjustment: store.updateAdjustment,
    removeAdjustment: store.removeAdjustment,
    updateSettlementSettings: store.updateSettlementSettings,
  };
}
