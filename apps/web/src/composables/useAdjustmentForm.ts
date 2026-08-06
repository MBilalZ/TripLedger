import { allocateSplit, formatPkr, paisaToRupees } from "@tripledger/engine";
import type { SplitMode } from "@tripledger/types";
import { parseRupeesToPaisa } from "@tripledger/validation";
import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";
import type { SplitPerson } from "@/components/SplitMatrix.vue";
import type { PaymentPrefill } from "@/composables/useTripTabs";
import type { ParticipantRow } from "@/db/dexie";
import { useWorkspaceStore } from "@/stores/workspace";
import { useFeedback } from "./useFeedback";

function defaultSplitPerson(p: ParticipantRow): SplitPerson {
  return {
    participantId: p.id,
    displayName: p.displayName,
    included: true,
    shares: 1,
    percentBps: 0,
    exactPaisa: 0,
  };
}

function syncSplitPeople(people: SplitPerson[], list: ParticipantRow[]): SplitPerson[] {
  const byId = new Map(people.map((p) => [p.participantId, p]));
  return list.map((p) => {
    const existing = byId.get(p.id);
    if (existing) {
      return { ...existing, displayName: p.displayName };
    }
    return defaultSplitPerson(p);
  });
}

export type AdjustmentFormOptions = {
  onClose?: () => void;
};

export function useAdjustmentForm(options: AdjustmentFormOptions = {}) {
  const store = useWorkspaceStore();
  const { participants, adjustments } = storeToRefs(store);
  const { success, error, confirmDanger } = useFeedback();

  const editingAdjustmentId = ref<string | null>(null);
  const paidById = ref("");
  const editReceivedById = ref("");
  const amountRupees = ref<number | null>(null);
  const reason = ref("");
  const splitMode = ref<SplitMode>("equal");
  const splitPeople = ref<SplitPerson[]>([]);

  const adjFormTitle = computed(() =>
    editingAdjustmentId.value ? "Edit payment" : "Record a payment",
  );

  const recipientOptions = computed(() =>
    participants.value.filter((p) => p.id !== paidById.value),
  );

  const includedPeople = computed(() => splitPeople.value.filter((p) => p.included));

  const nonPayerIncluded = computed(() =>
    includedPeople.value.filter((p) => p.participantId !== paidById.value),
  );

  const showSplitControls = computed(
    () => !editingAdjustmentId.value && includedPeople.value.length >= 2,
  );

  const paymentPreview = computed(() => {
    if (editingAdjustmentId.value) {
      if (
        !paidById.value ||
        !editReceivedById.value ||
        amountRupees.value == null ||
        amountRupees.value <= 0
      ) {
        return "";
      }
      return `${store.participantName(paidById.value)} paid ${store.participantName(editReceivedById.value)} ${formatPkr(Math.round(amountRupees.value * 100))}`;
    }

    if (
      !paidById.value ||
      amountRupees.value == null ||
      amountRupees.value <= 0 ||
      !nonPayerIncluded.value.length
    ) {
      return "";
    }

    const paidName = store.participantName(paidById.value);

    if (nonPayerIncluded.value.length === 1 && includedPeople.value.length === 1) {
      const only = nonPayerIncluded.value[0]!;
      return `${paidName} paid ${only.displayName} ${formatPkr(Math.round(amountRupees.value * 100))}`;
    }

    try {
      const amountPaisa = parseRupeesToPaisa(amountRupees.value);
      const alloc = allocateSplit(
        amountPaisa,
        splitMode.value,
        includedPeople.value.map((p) => ({
          participantId: p.participantId,
          included: true,
          shares: p.shares,
          percentBps: p.percentBps,
          exactPaisa: p.exactPaisa,
        })),
      );
      if (alloc.error || !alloc.slices.length) return "";

      const transfers = alloc.slices.filter(
        (s) => s.sharePaisa > 0 && s.participantId !== paidById.value,
      );
      if (!transfers.length) return "";

      if (transfers.length === 1 && includedPeople.value.length === 2) {
        const t = transfers[0]!;
        const recv = store.participantName(t.participantId);
        return `${paidName} paid Rs ${amountRupees.value.toLocaleString("en-PK")} · ${recv}’s share ${formatPkr(t.sharePaisa)}`;
      }

      return transfers
        .map(
          (t) =>
            `${paidName} → ${store.participantName(t.participantId)} ${formatPkr(t.sharePaisa)}`,
        )
        .join(" · ");
    } catch {
      return "";
    }
  });

  watch(
    participants,
    (list) => {
      if (!editingAdjustmentId.value) {
        splitPeople.value = syncSplitPeople(splitPeople.value, list);
      }
      if (!list.length) {
        if (!editingAdjustmentId.value) paidById.value = "";
        editReceivedById.value = "";
        return;
      }
      if (!editingAdjustmentId.value && !list.some((p) => p.id === paidById.value)) {
        paidById.value = list[0]!.id;
      }
      if (editReceivedById.value && !list.some((p) => p.id === editReceivedById.value)) {
        editReceivedById.value = "";
      }
    },
    { immediate: true, deep: true },
  );

  function clearAdjForm() {
    editingAdjustmentId.value = null;
    amountRupees.value = null;
    reason.value = "";
    splitMode.value = "equal";
    editReceivedById.value = "";
    splitPeople.value = participants.value.map(defaultSplitPerson);
    paidById.value = participants.value[0]?.id ?? "";
  }

  function startEditAdjustment(id: string) {
    const a = adjustments.value.find((x) => x.id === id);
    if (!a) return;
    editingAdjustmentId.value = id;
    // Storage: fromId=received, toId=paidBy
    paidById.value = a.toId;
    editReceivedById.value = a.fromId;
    amountRupees.value = paisaToRupees(a.amountPaisa);
    reason.value = a.reason;
    splitMode.value = "equal";
  }

  function finish() {
    clearAdjForm();
    options.onClose?.();
  }

  function isUnchangedEdit(id: string): boolean {
    const a = adjustments.value.find((x) => x.id === id);
    if (!a) return false;
    const amountPaisa = Math.round(Number(amountRupees.value ?? 0) * 100);
    return (
      paidById.value === a.toId &&
      editReceivedById.value === a.fromId &&
      amountPaisa === a.amountPaisa &&
      (reason.value || "") === (a.reason || "")
    );
  }

  async function onSaveAdj() {
    try {
      const amount = Number(amountRupees.value ?? 0);
      if (!paidById.value) throw new Error("Select who paid");
      if (amount <= 0) throw new Error("Enter an amount greater than zero");

      if (editingAdjustmentId.value) {
        if (!editReceivedById.value) throw new Error("Select who received");
        if (isUnchangedEdit(editingAdjustmentId.value)) {
          finish();
          return;
        }
        await store.updateAdjustment(editingAdjustmentId.value, {
          paidById: paidById.value,
          receivedById: editReceivedById.value,
          amountRupees: amount,
          reason: reason.value,
        });
        success("Payment updated");
        finish();
        return;
      }

      if (!nonPayerIncluded.value.length) {
        throw new Error("Include at least one friend besides the payer");
      }

      // Simple path: only one person in Split with, and they are not the payer
      if (nonPayerIncluded.value.length === 1 && includedPeople.value.length === 1) {
        await store.addAdjustment({
          paidById: paidById.value,
          receivedById: nonPayerIncluded.value[0]!.participantId,
          amountRupees: amount,
          reason: reason.value,
        });
        success("Payment recorded");
        finish();
        return;
      }

      await store.addSplitAdjustments({
        paidById: paidById.value,
        amountRupees: amount,
        reason: reason.value,
        splitMode: splitMode.value,
        recipients: splitPeople.value.map((p) => ({
          participantId: p.participantId,
          included: p.included,
          shares: p.shares,
          percentBps: p.percentBps,
          exactPaisa: p.exactPaisa,
        })),
      });
      success("Payment recorded");
      finish();
    } catch (e) {
      error("Failed", e);
    }
  }

  function confirmRemoveAdjustment(id: string) {
    confirmDanger({
      message: "Delete this payment? Grouped shares are removed together.",
      header: "Delete payment",
      acceptLabel: "Delete",
      rejectLabel: "Keep",
      onAccept: async () => {
        await store.removeAdjustment(id);
        if (editingAdjustmentId.value === id) clearAdjForm();
        success("Payment deleted");
      },
    });
  }

  function onSplitPersonChange(pid: string, patch: Partial<SplitPerson>) {
    splitPeople.value = splitPeople.value.map((p) =>
      p.participantId === pid ? { ...p, ...patch } : p,
    );
  }

  function toggleIncluded(participantId: string, included: boolean) {
    onSplitPersonChange(participantId, { included });
  }

  function applyPrefill(input: PaymentPrefill) {
    clearAdjForm();
    paidById.value = input.paidById;
    amountRupees.value = input.amountRupees;
    // Settle-up: only the person being paid back
    splitPeople.value = participants.value.map((p) => ({
      ...defaultSplitPerson(p),
      included: p.id === input.receivedById,
    }));
  }

  /** Display helper: paid by → received by */
  function paymentLabel(fromId: string, toId: string) {
    return `${store.participantName(toId)} paid ${store.participantName(fromId)}`;
  }

  return {
    editingAdjustmentId,
    paidById,
    editReceivedById,
    amountRupees,
    reason,
    splitMode,
    splitPeople,
    recipientOptions,
    showSplitControls,
    paymentPreview,
    adjFormTitle,
    clearAdjForm,
    applyPrefill,
    startEditAdjustment,
    onSaveAdj,
    confirmRemoveAdjustment,
    onSplitPersonChange,
    toggleIncluded,
    paymentLabel,
    participants,
    adjustments,
  };
}
