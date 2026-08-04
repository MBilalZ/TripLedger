import { computed, reactive, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { paisaToRupees } from "@tripledger/engine";
import type { SplitMode } from "@tripledger/types";
import type { SplitPerson } from "@/components/SplitMatrix.vue";
import { useWorkspaceStore } from "@/stores/workspace";
import { useFeedback } from "./useFeedback";

export function useExpenseForm() {
  const store = useWorkspaceStore();
  const { participants, pools, expenses, expenseSplits } = storeToRefs(store);
  const { success, error, confirmDanger } = useFeedback();

  const editingExpenseId = ref<string | null>(null);
  const useCustomSplit = ref(false);
  const customSplitMode = ref<SplitMode>("equal");
  const customSplits = ref<SplitPerson[]>([]);

  const expenseForm = reactive({
    description: "",
    category: "Misc",
    poolId: "",
    paidById: "",
    amountRupees: null as number | null,
    date: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  watch(
    [participants, useCustomSplit],
    () => {
      if (!useCustomSplit.value) return;
      customSplits.value = participants.value.map((p) => {
        const prev = customSplits.value.find((x) => x.participantId === p.id);
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
    },
    { immediate: true },
  );

  const expenseFormTitle = computed(() =>
    editingExpenseId.value ? "Edit expense" : "Add expense",
  );
  const canAddExpenses = computed(() => participants.value.length > 0);
  const reversedExpenses = computed(() => [...expenses.value].reverse());

  function clearExpenseForm() {
    editingExpenseId.value = null;
    expenseForm.description = "";
    expenseForm.category = "Misc";
    expenseForm.poolId = pools.value[0]?.id ?? "";
    expenseForm.paidById = participants.value[0]?.id ?? "";
    expenseForm.amountRupees = null;
    expenseForm.date = new Date().toISOString().slice(0, 10);
    expenseForm.notes = "";
    useCustomSplit.value = false;
    customSplitMode.value = "equal";
    customSplits.value = [];
  }

  function startEditExpense(expenseId: string) {
    const e = expenses.value.find((x) => x.id === expenseId);
    if (!e) return;
    editingExpenseId.value = expenseId;
    expenseForm.description = e.description;
    expenseForm.category = e.category || "Misc";
    expenseForm.poolId = e.poolId;
    expenseForm.paidById = e.paidById;
    expenseForm.amountRupees = paisaToRupees(e.amountPaisa);
    expenseForm.date = e.date;
    expenseForm.notes = e.notes;
    useCustomSplit.value = !!e.splitMode;
    customSplitMode.value = e.splitMode ?? "equal";
    if (e.splitMode) {
      const splits = expenseSplits.value.filter((s) => s.expenseId === e.id);
      customSplits.value = participants.value.map((p) => {
        const s = splits.find((x) => x.participantId === p.id);
        return {
          participantId: p.id,
          displayName: p.displayName,
          included: s?.included ?? false,
          shares: s?.shares ?? 1,
          percentBps: s?.percentBps ?? 0,
          exactPaisa: s?.exactPaisa ?? 0,
        };
      });
    }
  }

  function expensePayload() {
    return {
      ...expenseForm,
      amountRupees: Number(expenseForm.amountRupees ?? 0),
      splitMode: useCustomSplit.value ? customSplitMode.value : null,
      splits: useCustomSplit.value
        ? customSplits.value.map((s) => ({
            participantId: s.participantId,
            included: s.included,
            shares: s.shares,
            percentBps: s.percentBps,
            exactPaisa: s.exactPaisa,
          }))
        : undefined,
    };
  }

  async function onSaveExpense() {
    try {
      const payload = expensePayload();
      if (editingExpenseId.value) {
        await store.reviseExpense(editingExpenseId.value, payload);
        success("Expense updated");
      } else {
        await store.addExpense(payload);
        success("Expense added");
      }
      clearExpenseForm();
    } catch (e) {
      error("Failed", e);
    }
  }

  function confirmVoidExpense(id: string, description: string) {
    confirmDanger({
      message: `Void expense “${description || "Untitled"}”? It will no longer count in settlement.`,
      header: "Void expense",
      onAccept: async () => {
        await store.voidExpense(id);
        if (editingExpenseId.value === id) clearExpenseForm();
        success("Expense voided");
      },
    });
  }

  function onCustomSplitChange(
    pid: string,
    patch: Partial<SplitPerson>,
  ) {
    const row = customSplits.value.find((x) => x.participantId === pid);
    if (row) Object.assign(row, patch);
  }

  return {
    editingExpenseId,
    useCustomSplit,
    customSplitMode,
    customSplits,
    expenseForm,
    expenseFormTitle,
    canAddExpenses,
    reversedExpenses,
    clearExpenseForm,
    startEditExpense,
    onSaveExpense,
    confirmVoidExpense,
    onCustomSplitChange,
  };
}
