import { paisaToRupees } from "@tripledger/engine";
import type { SplitMode } from "@tripledger/types";
import { storeToRefs } from "pinia";
import { computed, reactive, ref, watch } from "vue";
import type { SplitPerson } from "@/components/SplitMatrix.vue";
import { useWorkspaceStore } from "@/stores/workspace";
import { useFeedback } from "./useFeedback";

function lastPoolKey(tripId: string) {
  return `tl:lastPool:${tripId}`;
}

export type ExpenseFormOptions = {
  onClose?: () => void;
};

export function useExpenseForm(options: ExpenseFormOptions = {}) {
  const store = useWorkspaceStore();
  const { tripId, participants, pools, expenses, expenseSplits } = storeToRefs(store);
  const { success, error, confirmDanger } = useFeedback();

  const editingExpenseId = ref<string | null>(null);
  const useCustomSplit = ref(false);
  const customSplitMode = ref<SplitMode>("equal");
  const customSplits = ref<SplitPerson[]>([]);
  const showForm = ref(false);

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

  const selectedPool = computed(
    () => pools.value.find((p) => p.id === expenseForm.poolId) ?? null,
  );

  function defaultPoolId(): string {
    const tid = tripId.value;
    if (tid) {
      try {
        const saved = localStorage.getItem(lastPoolKey(tid));
        if (saved && pools.value.some((p) => p.id === saved)) return saved;
      } catch {
        /* ignore */
      }
    }
    const general = pools.value.find((p) => p.name.trim().toLowerCase() === "general");
    return general?.id ?? pools.value[0]?.id ?? "";
  }

  function rememberPool(poolId: string) {
    const tid = tripId.value;
    if (!tid || !poolId) return;
    try {
      localStorage.setItem(lastPoolKey(tid), poolId);
    } catch {
      /* ignore */
    }
  }

  function clearExpenseForm() {
    editingExpenseId.value = null;
    expenseForm.description = "";
    expenseForm.category = "Misc";
    expenseForm.poolId = defaultPoolId();
    expenseForm.paidById = participants.value[0]?.id ?? "";
    expenseForm.amountRupees = null;
    expenseForm.date = new Date().toISOString().slice(0, 10);
    expenseForm.notes = "";
    useCustomSplit.value = false;
    customSplitMode.value = "equal";
    customSplits.value = [];
    showForm.value = false;
  }

  function openAddExpense() {
    clearExpenseForm();
    showForm.value = true;
    expenseForm.poolId = defaultPoolId();
    expenseForm.paidById = participants.value[0]?.id ?? "";
  }

  function startEditExpense(expenseId: string) {
    const e = expenses.value.find((x) => x.id === expenseId);
    if (!e) {
      editingExpenseId.value = null;
      return;
    }
    editingExpenseId.value = expenseId;
    showForm.value = true;
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
    } else {
      customSplits.value = [];
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

  function isUnchangedEdit(expenseId: string): boolean {
    const e = expenses.value.find((x) => x.id === expenseId);
    if (!e) return false;
    const payload = expensePayload();
    const amountPaisa = Math.round(payload.amountRupees * 100);
    if (
      payload.description !== e.description ||
      (payload.category || "Misc") !== (e.category || "Misc") ||
      payload.poolId !== e.poolId ||
      payload.paidById !== e.paidById ||
      amountPaisa !== e.amountPaisa ||
      payload.date !== e.date ||
      (payload.notes || "") !== (e.notes || "") ||
      (payload.splitMode ?? null) !== (e.splitMode ?? null)
    ) {
      return false;
    }
    if (!payload.splitMode) return true;
    const existing = expenseSplits.value.filter((s) => s.expenseId === e.id);
    const next = payload.splits ?? [];
    if (existing.length !== next.length) return false;
    for (const row of next) {
      const s = existing.find((x) => x.participantId === row.participantId);
      if (
        !s ||
        s.included !== row.included ||
        s.shares !== row.shares ||
        s.percentBps !== row.percentBps ||
        s.exactPaisa !== row.exactPaisa
      ) {
        return false;
      }
    }
    return true;
  }

  function finish() {
    clearExpenseForm();
    options.onClose?.();
  }

  async function onSaveExpense() {
    try {
      const payload = expensePayload();
      if (editingExpenseId.value) {
        if (isUnchangedEdit(editingExpenseId.value)) {
          finish();
          return;
        }
        await store.reviseExpense(editingExpenseId.value, payload);
        success("Expense updated");
      } else {
        await store.addExpense(payload);
        success("Expense added");
      }
      if (payload.poolId) rememberPool(payload.poolId);
      finish();
    } catch (e) {
      error("Failed", e);
    }
  }

  function confirmVoidExpense(id: string, description: string) {
    confirmDanger({
      message: `Void expense “${description || "Untitled"}”? It will no longer count in settlement.`,
      header: "Void expense",
      acceptLabel: "Void",
      rejectLabel: "Keep",
      onAccept: async () => {
        await store.voidExpense(id);
        if (editingExpenseId.value === id) finish();
        success("Expense voided");
      },
    });
  }

  function onCustomSplitChange(pid: string, patch: Partial<SplitPerson>) {
    const row = customSplits.value.find((x) => x.participantId === pid);
    if (row) Object.assign(row, patch);
  }

  watch(
    pools,
    () => {
      if (!editingExpenseId.value && !expenseForm.poolId) {
        expenseForm.poolId = defaultPoolId();
      }
    },
    { immediate: true },
  );

  return {
    editingExpenseId,
    useCustomSplit,
    customSplitMode,
    customSplits,
    expenseForm,
    expenseFormTitle,
    canAddExpenses,
    reversedExpenses,
    selectedPool,
    showForm,
    openAddExpense,
    clearExpenseForm,
    startEditExpense,
    onSaveExpense,
    confirmVoidExpense,
    onCustomSplitChange,
  };
}
