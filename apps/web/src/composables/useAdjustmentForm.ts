import { paisaToRupees } from "@tripledger/engine";
import type { SplitMode } from "@tripledger/types";
import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";
import type { SplitPerson } from "@/components/SplitMatrix.vue";
import { useWorkspaceStore } from "@/stores/workspace";
import { useFeedback } from "./useFeedback";

export function useAdjustmentForm() {
  const store = useWorkspaceStore();
  const { participants, adjustments } = storeToRefs(store);
  const { success, error, confirmDanger } = useFeedback();

  const editingAdjustmentId = ref<string | null>(null);
  const paidById = ref("");
  const receivedByIds = ref<string[]>([]);
  const amountRupees = ref<number | null>(null);
  const reason = ref("");
  const splitMode = ref<SplitMode>("equal");
  const recipientSplits = ref<SplitPerson[]>([]);

  const adjFormTitle = computed(() =>
    editingAdjustmentId.value ? "Edit payment" : "Record a payment",
  );

  const recipientOptions = computed(() =>
    participants.value.filter((p) => p.id !== paidById.value),
  );

  const showSplitControls = computed(
    () => !editingAdjustmentId.value && receivedByIds.value.length >= 2,
  );

  const editReceivedById = computed({
    get: () => receivedByIds.value[0] ?? "",
    set: (v: string) => {
      receivedByIds.value = v ? [v] : [];
    },
  });

  function syncRecipientSplits() {
    const selected = new Set(receivedByIds.value);
    recipientSplits.value = participants.value
      .filter((p) => selected.has(p.id) && p.id !== paidById.value)
      .map((p) => {
        const prev = recipientSplits.value.find((x) => x.participantId === p.id);
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

  watch([receivedByIds, paidById, participants], () => {
    // Drop paid-by from recipients if selected
    if (paidById.value) {
      receivedByIds.value = receivedByIds.value.filter((id) => id !== paidById.value);
    }
    syncRecipientSplits();
  });

  function clearAdjForm() {
    editingAdjustmentId.value = null;
    paidById.value = "";
    receivedByIds.value = [];
    amountRupees.value = null;
    reason.value = "";
    splitMode.value = "equal";
    recipientSplits.value = [];
  }

  function startEditAdjustment(id: string) {
    const a = adjustments.value.find((x) => x.id === id);
    if (!a) return;
    editingAdjustmentId.value = id;
    // Storage: fromId=received, toId=paidBy
    paidById.value = a.toId;
    receivedByIds.value = [a.fromId];
    amountRupees.value = paisaToRupees(a.amountPaisa);
    reason.value = a.reason;
  }

  async function onSaveAdj() {
    try {
      const amount = Number(amountRupees.value ?? 0);
      if (!paidById.value) throw new Error("Select who paid");
      if (!receivedByIds.value.length) {
        throw new Error("Select at least one friend who received");
      }

      if (editingAdjustmentId.value) {
        const receivedById = receivedByIds.value[0];
        if (!receivedById) throw new Error("Select who received");
        await store.updateAdjustment(editingAdjustmentId.value, {
          paidById: paidById.value,
          receivedById,
          amountRupees: amount,
          reason: reason.value,
        });
        success("Payment updated");
        clearAdjForm();
        return;
      }

      if (receivedByIds.value.length === 1) {
        await store.addAdjustment({
          paidById: paidById.value,
          receivedById: receivedByIds.value[0]!,
          amountRupees: amount,
          reason: reason.value,
        });
        success("Payment recorded");
        clearAdjForm();
        return;
      }

      await store.addSplitAdjustments({
        paidById: paidById.value,
        amountRupees: amount,
        reason: reason.value,
        splitMode: splitMode.value,
        recipients: recipientSplits.value,
      });
      success("Payment recorded");
      clearAdjForm();
    } catch (e) {
      error("Failed", e);
    }
  }

  function confirmRemoveAdjustment(id: string) {
    confirmDanger({
      message: "Delete this payment? Grouped shares are removed together.",
      header: "Delete payment",
      onAccept: async () => {
        await store.removeAdjustment(id);
        if (editingAdjustmentId.value === id) clearAdjForm();
        success("Payment deleted");
      },
    });
  }

  function onRecipientSplitChange(pid: string, patch: Partial<SplitPerson>) {
    const row = recipientSplits.value.find((x) => x.participantId === pid);
    if (row) Object.assign(row, patch);
  }

  /** Display helper: paid by → received by */
  function paymentLabel(fromId: string, toId: string) {
    return `${store.participantName(toId)} paid ${store.participantName(fromId)}`;
  }

  return {
    editingAdjustmentId,
    paidById,
    receivedByIds,
    editReceivedById,
    amountRupees,
    reason,
    splitMode,
    recipientSplits,
    recipientOptions,
    showSplitControls,
    adjFormTitle,
    clearAdjForm,
    startEditAdjustment,
    onSaveAdj,
    confirmRemoveAdjustment,
    onRecipientSplitChange,
    paymentLabel,
    // keep reactive form alias for templates that need participants
    participants,
    adjustments,
  };
}
