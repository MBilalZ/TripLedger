import { ref } from "vue";
import { storeToRefs } from "pinia";
import { formatPkr } from "@tripledger/engine";
import type { SplitPerson } from "@/components/SplitMatrix.vue";
import { useWorkspaceStore } from "@/stores/workspace";
import { useFeedback } from "./useFeedback";

export function usePeoplePoolsUi() {
  const store = useWorkspaceStore();
  const { participants, pools, settlement } = storeToRefs(store);
  const { success, error, run, confirmDanger } = useFeedback();

  const editingTrip = ref(false);
  const tripNameDraft = ref("");
  const editingParticipantId = ref<string | null>(null);
  const newParticipant = ref("");
  const editingPoolId = ref<string | null>(null);
  const newPool = ref("");
  const poolNameDraft = ref("");
  let poolMemberPersistTimer: ReturnType<typeof setTimeout> | null = null;

  function startEditTrip() {
    if (!store.trip) return;
    editingTrip.value = true;
    tripNameDraft.value = store.trip.name;
  }

  function cancelEditTrip() {
    editingTrip.value = false;
  }

  async function saveTrip() {
    await run(
      async () => {
        await store.updateTrip({ name: tripNameDraft.value, currency: "PKR" });
        editingTrip.value = false;
      },
      { success: "Trip updated" },
    );
  }

  function startEditParticipant(id: string, name: string) {
    editingParticipantId.value = id;
    newParticipant.value = name;
  }

  function cancelEditParticipant() {
    editingParticipantId.value = null;
    newParticipant.value = "";
  }

  async function saveParticipant() {
    try {
      if (editingParticipantId.value) {
        await store.updateParticipant(editingParticipantId.value, {
          displayName: newParticipant.value,
        });
        success("Person updated");
      } else {
        await store.addParticipant(newParticipant.value);
        success("Person added");
      }
      cancelEditParticipant();
    } catch (e) {
      error("Failed", e);
    }
  }

  function confirmRemoveParticipant(id: string, displayName: string) {
    confirmDanger({
      message: `Remove ${displayName} from this trip?`,
      header: "Remove person",
      onAccept: async () => {
        try {
          await store.removeParticipant(id);
          success("Person removed");
        } catch (e) {
          error("Cannot remove", e, 5000);
        }
      },
    });
  }

  async function onAddPool() {
    try {
      const id = await store.addPool(newPool.value);
      if (!id) return;
      newPool.value = "";
      success("Pool added");
    } catch (e) {
      error("Cannot add pool", e, 4000);
    }
  }

  function startEditPoolName(id: string, name: string) {
    editingPoolId.value = id;
    poolNameDraft.value = name;
  }

  function cancelEditPoolName() {
    editingPoolId.value = null;
    poolNameDraft.value = "";
  }

  async function savePoolName() {
    if (!editingPoolId.value) return;
    await run(
      async () => {
        await store.updatePool(editingPoolId.value!, {
          name: poolNameDraft.value,
        });
        cancelEditPoolName();
      },
      { success: "Pool updated" },
    );
  }

  function confirmRemovePool(id: string, poolLabel: string) {
    confirmDanger({
      message: `Delete pool “${poolLabel}”?`,
      header: "Delete pool",
      onAccept: async () => {
        try {
          await store.removePool(id);
          success("Pool deleted");
        } catch (e) {
          error("Cannot delete", e, 5000);
        }
      },
    });
  }

  function peopleForPool(poolId: string): SplitPerson[] {
    return participants.value.map((p) => {
      const m = store.poolMember(poolId, p.id);
      return {
        participantId: p.id,
        displayName: p.displayName,
        included: m?.included ?? true,
        shares: m?.shares ?? 1,
        percentBps: m?.percentBps ?? 0,
        exactPaisa: m?.exactPaisa ?? 0,
      };
    });
  }

  function poolTotal(poolId: string) {
    return (
      settlement.value?.pools.find((p) => p.poolId === poolId)?.totalPaisa ?? 0
    );
  }

  async function onPoolMemberChange(
    poolId: string,
    participantId: string,
    patch: Partial<SplitPerson>,
  ) {
    const clean: Partial<
      Pick<SplitPerson, "included" | "shares" | "percentBps" | "exactPaisa">
    > = {};
    if (patch.included !== undefined) clean.included = patch.included;
    if (patch.shares !== undefined) clean.shares = patch.shares;
    if (patch.percentBps !== undefined) clean.percentBps = patch.percentBps;
    if (patch.exactPaisa !== undefined) clean.exactPaisa = patch.exactPaisa;
    if (poolMemberPersistTimer) clearTimeout(poolMemberPersistTimer);
    const delay = patch.included !== undefined ? 0 : 250;
    poolMemberPersistTimer = setTimeout(() => {
      void store.upsertPoolMember(poolId, participantId, clean);
    }, delay);
  }

  return {
    editingTrip,
    tripNameDraft,
    editingParticipantId,
    newParticipant,
    editingPoolId,
    newPool,
    poolNameDraft,
    startEditTrip,
    cancelEditTrip,
    saveTrip,
    startEditParticipant,
    cancelEditParticipant,
    saveParticipant,
    confirmRemoveParticipant,
    onAddPool,
    startEditPoolName,
    cancelEditPoolName,
    savePoolName,
    confirmRemovePool,
    peopleForPool,
    poolTotal,
    onPoolMemberChange,
    formatPkr,
    pools,
    participants,
  };
}
