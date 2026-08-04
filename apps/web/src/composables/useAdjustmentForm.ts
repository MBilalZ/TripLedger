import { paisaToRupees } from "@tripledger/engine";
import type { SplitMode } from "@tripledger/types";
import { storeToRefs } from "pinia";
import { computed, reactive, ref, watch } from "vue";
import type { SplitPerson } from "@/components/SplitMatrix.vue";
import { useWorkspaceStore } from "@/stores/workspace";
import { useFeedback } from "./useFeedback";

export function useAdjustmentForm() {
  const store = useWorkspaceStore();
  const { participants, adjustments } = storeToRefs(store);
  const { success, error, confirmDanger } = useFeedback();

  const editingAdjustmentId = ref<string | null>(null);
  const adjMode = ref<"simple" | "split">("simple");
  const adjSplitMode = ref<SplitMode>("equal");
  const adjDebtors = ref<SplitPerson[]>([]);
  const adjForm = reactive({
    fromId: "",
    toId: "",
    amountRupees: null as number | null,
    reason: "",
    creditorId: "",
  });

  function syncAdjDebtors() {
    adjDebtors.value = participants.value.map((p) => {
      const prev = adjDebtors.value.find((x) => x.participantId === p.id);
      return (
        prev ?? {
          participantId: p.id,
          displayName: p.displayName,
          included: true,
          shares: 1,
          percentBps: 0,
          exactPaisa: 0,
        }
      );
    });
  }

  watch(participants, () => syncAdjDebtors(), { immediate: true });

  const adjFormTitle = computed(() =>
    editingAdjustmentId.value ? "Edit adjustment" : "Add adjustment",
  );

  function clearAdjForm() {
    editingAdjustmentId.value = null;
    adjMode.value = "simple";
    adjForm.fromId = "";
    adjForm.toId = "";
    adjForm.creditorId = "";
    adjForm.amountRupees = null;
    adjForm.reason = "";
    adjSplitMode.value = "equal";
    syncAdjDebtors();
  }

  function startEditAdjustment(id: string) {
    const a = adjustments.value.find((x) => x.id === id);
    if (!a) return;
    editingAdjustmentId.value = id;
    adjForm.fromId = a.fromId;
    adjForm.toId = a.toId;
    adjForm.amountRupees = paisaToRupees(a.amountPaisa);
    adjForm.reason = a.reason;
  }

  async function onSaveAdj() {
    try {
      if (adjMode.value === "split" && !editingAdjustmentId.value) {
        await store.addSplitAdjustments({
          creditorId: adjForm.creditorId,
          amountRupees: Number(adjForm.amountRupees ?? 0),
          reason: adjForm.reason,
          splitMode: adjSplitMode.value,
          debtors: adjDebtors.value,
        });
        success("Split adjustment added");
        clearAdjForm();
        return;
      }
      const payload = {
        fromId: adjForm.fromId,
        toId: adjForm.toId,
        amountRupees: Number(adjForm.amountRupees ?? 0),
        reason: adjForm.reason,
      };
      if (editingAdjustmentId.value) {
        await store.updateAdjustment(editingAdjustmentId.value, payload);
        success("Adjustment updated");
      } else {
        await store.addAdjustment(payload);
        success("Adjustment added");
      }
      clearAdjForm();
    } catch (e) {
      error("Failed", e);
    }
  }

  function confirmRemoveAdjustment(id: string) {
    confirmDanger({
      message: "Delete this adjustment?",
      header: "Delete adjustment",
      onAccept: async () => {
        await store.removeAdjustment(id);
        if (editingAdjustmentId.value === id) clearAdjForm();
        success("Adjustment deleted");
      },
    });
  }

  function onDebtorChange(pid: string, patch: Partial<SplitPerson>) {
    const row = adjDebtors.value.find((x) => x.participantId === pid);
    if (row) Object.assign(row, patch);
  }

  return {
    editingAdjustmentId,
    adjMode,
    adjSplitMode,
    adjDebtors,
    adjForm,
    adjFormTitle,
    clearAdjForm,
    startEditAdjustment,
    onSaveAdj,
    confirmRemoveAdjustment,
    onDebtorChange,
  };
}
