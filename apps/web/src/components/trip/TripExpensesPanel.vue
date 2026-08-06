<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import Textarea from "primevue/textarea";
import { formatPkr } from "@tripledger/engine";
import SplitMatrix from "@/components/SplitMatrix.vue";
import { EXPENSE_CATEGORIES, SPLIT_MODES } from "@/constants/tripOptions";
import { useExpenseForm } from "@/composables/useExpenseForm";
import { isEnabled } from "@/lib/features";
import { useWorkspaceStore } from "@/stores/workspace";

defineProps<{ visible: boolean }>();
const emit = defineEmits<{ openFriends: [] }>();

const store = useWorkspaceStore();
const { participants, pools } = storeToRefs(store);
const {
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
} = useExpenseForm();

type ExpenseGroup = { date: string; items: typeof reversedExpenses.value };

const groupedExpenses = computed(() => {
  const map = new Map<string, typeof reversedExpenses.value>();
  for (const e of reversedExpenses.value) {
    const key = e.date || "Undated";
    const list = map.get(key) ?? [];
    list.push(e);
    map.set(key, list);
  }
  return [...map.entries()].map(([date, items]) => ({ date, items })) as ExpenseGroup[];
});
</script>

<template>
  <div v-show="visible" class="space-y-4">
    <div v-if="!canAddExpenses" class="tl-card space-y-3">
      <h3 class="tl-section-title mb-0">Add friends first</h3>
      <p class="text-sm text-tl-muted">
        Add at least one friend before logging expenses. Pick a pool when you
        add an expense — that sets who shares by default.
      </p>
      <Button
        label="Add friends"
        icon="pi pi-users"
        size="small"
        @click="emit('openFriends')"
      />
    </div>

    <template v-else>
      <div v-if="showForm" class="tl-card grid gap-3">
        <div class="flex items-center justify-between">
          <h3 class="tl-section-title mb-0">{{ expenseFormTitle }}</h3>
          <Button
            label="Cancel"
            size="small"
            severity="secondary"
            text
            @click="clearExpenseForm"
          />
        </div>

        <div>
          <label class="tl-input-label">Pool</label>
          <Select
            v-model="expenseForm.poolId"
            :options="pools"
            option-label="name"
            option-value="id"
            :placeholder="
              pools.length ? 'Which pool?' : 'General (auto-created on save)'
            "
            class="w-full"
          />
          <p class="mt-1 text-xs text-tl-muted">
            Pool sets who shares this expense.
            <template v-if="selectedPool">
              Default split: {{ selectedPool.splitMode }}.
            </template>
          </p>
        </div>

        <div>
          <label class="tl-input-label">Description</label>
          <InputText
            v-model="expenseForm.description"
            class="w-full"
            placeholder="What was this for?"
          />
        </div>

        <div>
          <label class="tl-input-label">Amount (PKR)</label>
          <InputNumber
            v-model="expenseForm.amountRupees"
            class="w-full"
            :min-fraction-digits="0"
            :max-fraction-digits="2"
          />
        </div>

        <div>
          <label class="tl-input-label">Paid by</label>
          <Select
            v-model="expenseForm.paidById"
            :options="participants"
            option-label="displayName"
            option-value="id"
            placeholder="Who paid?"
            class="w-full"
          />
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label class="tl-input-label">Category</label>
            <Select
              v-model="expenseForm.category"
              :options="[...EXPENSE_CATEGORIES]"
              class="w-full"
            />
          </div>
          <div>
            <label class="tl-input-label">Date</label>
            <InputText v-model="expenseForm.date" type="date" class="w-full" />
          </div>
        </div>

        <div>
          <label class="tl-input-label">Notes</label>
          <Textarea v-model="expenseForm.notes" rows="2" class="w-full" />
        </div>

        <div
          v-if="isEnabled('advanced_splits')"
          class="flex items-center gap-2"
        >
          <Checkbox v-model="useCustomSplit" binary input-id="custom-split" />
          <label for="custom-split" class="text-sm">
            Custom split (override pool default)
          </label>
        </div>
        <div v-if="useCustomSplit && isEnabled('advanced_splits')" class="space-y-3">
          <Select
            v-model="customSplitMode"
            :options="SPLIT_MODES"
            option-label="label"
            option-value="value"
            class="w-full"
          />
          <SplitMatrix
            :mode="customSplitMode"
            :people="customSplits"
            :total-paisa="Math.round(Number(expenseForm.amountRupees ?? 0) * 100)"
            @change="onCustomSplitChange"
          />
        </div>

        <div class="flex flex-wrap gap-2">
          <Button
            :label="editingExpenseId ? 'Save expense' : 'Add expense'"
            :icon="editingExpenseId ? 'pi pi-check' : 'pi pi-plus'"
            @click="onSaveExpense"
          />
        </div>
      </div>

      <div class="tl-card">
        <h3 class="tl-section-title">Expenses</h3>
        <p v-if="!reversedExpenses.length" class="text-sm text-tl-muted">
          No expenses yet. Choose a pool first — that decides who shares.
        </p>
        <template v-for="group in groupedExpenses" :key="group.date">
          <div class="tl-date-group">{{ group.date }}</div>
          <div
            v-for="e in group.items"
            :key="e.id"
            class="tl-expense-card"
            :class="{ 'is-editing': editingExpenseId === e.id }"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="font-medium text-tl">{{ e.description }}</div>
                <div class="mt-1 text-xs text-tl-muted">
                  <span class="tl-pool-tag">{{ store.poolName(e.poolId) }}</span>
                  · {{ e.category }}
                </div>
                <div class="mt-1 text-xs text-tl-muted">
                  {{ store.participantName(e.paidById) }} paid ·
                  {{ e.splitMode ? `custom · ${e.splitMode}` : "pool default" }}
                </div>
              </div>
              <div class="text-right">
                <div class="font-semibold text-tl-accent-bright">
                  {{ formatPkr(e.amountPaisa) }}
                </div>
                <div class="mt-1 flex justify-end gap-1">
                  <Button
                    icon="pi pi-pencil"
                    text
                    rounded
                    size="small"
                    @click="startEditExpense(e.id)"
                  />
                  <Button
                    icon="pi pi-trash"
                    text
                    severity="danger"
                    rounded
                    size="small"
                    aria-label="Void expense"
                    @click="confirmVoidExpense(e.id, e.description)"
                  />
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <button
        v-if="!showForm"
        type="button"
        class="tl-fab"
        @click="openAddExpense"
      >
        <i class="pi pi-receipt" aria-hidden="true" />
        Add expense
      </button>
    </template>
  </div>
</template>
