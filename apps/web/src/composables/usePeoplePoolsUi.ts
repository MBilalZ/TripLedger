import { formatPkr } from "@tripledger/engine";
import { storeToRefs } from "pinia";
import { computed, ref } from "vue";
import type { SplitPerson } from "@/components/SplitMatrix.vue";
import { useWorkspaceStore } from "@/stores/workspace";
import { useFeedback } from "./useFeedback";

export type PeoplePoolsUiOptions = {
  onClose?: () => void;
};

export function usePeoplePoolsUi(options: PeoplePoolsUiOptions = {}) {
  const store = useWorkspaceStore();
  const { participants, pools, settlement } = storeToRefs(store);
  const { success, error, run, confirmDanger } = useFeedback();

  const editingTrip = ref(false);
  const tripNameDraft = ref("");
  const editingParticipantId = ref<string | null>(null);
  const friendName = ref("");
  const editingPoolId = ref<string | null>(null);
  const poolName = ref("");
  let poolMemberPersistTimer: ReturnType<typeof setTimeout> | null = null;

  const friendFormTitle = computed(() =>
    editingParticipantId.value ? "Edit friend" : "Add friend",
  );
  const poolFormTitle = computed(() =>
    editingPoolId.value ? "Edit pool" : "Add pool",
  );
  const canAddPools = computed(() => participants.value.length > 0);

  const editingPool = computed(
    () => pools.value.find((p) => p.id === editingPoolId.value) ?? null,
  );

  function finish() {
    options.onClose?.();
  }

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
        await store.updateTrip({ name: tripNameDraft.value });
        editingTrip.value = false;
      },
      { success: "Group updated" },
    );
  }

  function clearFriendForm() {
    editingParticipantId.value = null;
    friendName.value = "";
  }

  function openAddFriend() {
    clearFriendForm();
  }

  function startEditFriend(id: string) {
    const p = participants.value.find((x) => x.id === id);
    if (!p) {
      editingParticipantId.value = null;
      return;
    }
    editingParticipantId.value = id;
    friendName.value = p.displayName;
  }

  async function onSaveFriend() {
    const name = friendName.value.trim();
    if (!name) {
      error("Name is required");
      return;
    }
    try {
      if (editingParticipantId.value) {
        await store.updateParticipant(editingParticipantId.value, {
          displayName: name,
        });
        success("Friend updated");
      } else {
        await store.addParticipant(name);
        success("Friend added");
      }
      clearFriendForm();
      finish();
    } catch (e) {
      error("Failed", e);
    }
  }

  function confirmRemoveParticipant(id: string, displayName: string) {
    confirmDanger({
      header: "Remove friend?",
      message: `${displayName} will be removed from this group.`,
      onAccept: async () => {
        try {
          await store.removeParticipant(id);
          success("Friend removed");
        } catch (e) {
          error("Cannot remove", e, 5000);
        }
      },
    });
  }

  function clearPoolForm() {
    editingPoolId.value = null;
    poolName.value = "";
  }

  function openAddPool() {
    clearPoolForm();
  }

  function startEditPool(id: string) {
    const pool = pools.value.find((p) => p.id === id);
    if (!pool) {
      editingPoolId.value = null;
      return;
    }
    editingPoolId.value = id;
    poolName.value = pool.name;
  }

  async function onSavePool() {
    const name = poolName.value.trim();
    if (!name) {
      error("Pool name is required");
      return;
    }
    try {
      if (editingPoolId.value) {
        const pool = pools.value.find((p) => p.id === editingPoolId.value);
        if (pool && name !== pool.name.trim()) {
          await store.updatePool(editingPoolId.value, { name });
        }
        success("Pool updated");
        clearPoolForm();
        finish();
        return;
      }
      const id = await store.addPool(name);
      if (!id) return;
      clearPoolForm();
      success("Pool added");
      finish();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/saved locally|sync/i.test(msg)) {
        clearPoolForm();
        error("Pool saved on this device", e, 5000);
        finish();
        return;
      }
      error(editingPoolId.value ? "Failed" : "Cannot add pool", e, 4000);
    }
  }

  function confirmRemovePool(id: string, poolLabel: string) {
    confirmDanger({
      header: "Remove pool?",
      message: `“${poolLabel}” and its sharing setup will be removed.`,
      onAccept: async () => {
        try {
          await store.removePool(id);
          success("Pool removed");
        } catch (e) {
          error("Cannot remove", e, 5000);
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
    return settlement.value?.pools.find((p) => p.poolId === poolId)?.totalPaisa ?? 0;
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
    friendName,
    friendFormTitle,
    editingPoolId,
    editingPool,
    poolName,
    poolFormTitle,
    canAddPools,
    startEditTrip,
    cancelEditTrip,
    saveTrip,
    clearFriendForm,
    openAddFriend,
    startEditFriend,
    onSaveFriend,
    confirmRemoveParticipant,
    clearPoolForm,
    openAddPool,
    startEditPool,
    onSavePool,
    confirmRemovePool,
    peopleForPool,
    poolTotal,
    onPoolMemberChange,
    formatPkr,
    pools,
    participants,
  };
}
