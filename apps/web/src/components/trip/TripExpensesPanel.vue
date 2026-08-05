<script setup lang="ts">
import { storeToRefs } from "pinia";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import Textarea from "primevue/textarea";
import { formatPkr } from "@tripledger/engine";
import SplitMatrix from "@/components/SplitMatrix.vue";
import ExpenseReceipts from "@/components/trip/ExpenseReceipts.vue";
import { EXPENSE_CATEGORIES, SPLIT_MODES } from "@/constants/tripOptions";
import { useExpenseForm } from "@/composables/useExpenseForm";
import type { MoreSection } from "@/composables/useTripTabs";
import { useWorkspaceStore } from "@/stores/workspace";

defineProps<{ visible: boolean }>();
const emit = defineEmits<{ openMore: [section: MoreSection] }>();

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
  clearExpenseForm,
  startEditExpense,
  onSaveExpense,
  confirmVoidExpense,
  onCustomSplitChange,
} = useExpenseForm();
</script>

<template>
  <div v-show="visible" class="space-y-4">
    <div v-if="!canAddExpenses" class="tl-card space-y-3">
      <h3 class="tl-section-title mb-0">Add friends first</h3>
      <p class="text-sm text-tl-muted">
        Add at least one friend before logging expenses. A default “General”
        pool is created automatically if you have not made one.
      </p>
      <Button
        label="Add friends"
        icon="pi pi-users"
        size="small"
        @click="emit('openMore', 'people')"
      />
    </div>
    <div v-else class="tl-card grid gap-3">
      <div class="flex items-center justify-between">
        <h3 class="tl-section-title mb-0">{{ expenseFormTitle }}</h3>
        <Button
          v-if="editingExpenseId"
          label="Cancel"
          size="small"
          severity="secondary"
          text
          @click="clearExpenseForm"
        />
      </div>
      <div>
        <label class="tl-input-label">Description</label>
        <InputText v-model="expenseForm.description" class="w-full" />
      </div>
      <div>
        <label class="tl-input-label">Amount (Rs)</label>
        <InputNumber
          v-model="expenseForm.amountRupees"
          class="w-full"
          :min-fraction-digits="0"
          :max-fraction-digits="2"
        />
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label class="tl-input-label">Pool</label>
          <Select
            v-model="expenseForm.poolId"
            :options="pools"
            option-label="name"
            option-value="id"
            :placeholder="
              pools.length ? 'Select pool' : 'General (auto-created on save)'
            "
            class="w-full"
            :show-clear="!!pools.length"
          />
        </div>
        <div>
          <label class="tl-input-label">Paid by</label>
          <Select
            v-model="expenseForm.paidById"
            :options="participants"
            option-label="displayName"
            option-value="id"
            placeholder="Payer"
            class="w-full"
          />
        </div>
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
      <div class="flex items-center gap-2">
        <Checkbox v-model="useCustomSplit" binary input-id="custom-split" />
        <label for="custom-split" class="text-sm"
          >Custom split (override pool default)</label
        >
      </div>
      <div v-if="useCustomSplit" class="space-y-3">
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
        No expenses yet.
      </p>
      <div
        v-for="e in reversedExpenses"
        :key="e.id"
        class="tl-expense-card"
        :class="{ 'is-editing': editingExpenseId === e.id }"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="font-medium text-tl">{{ e.description }}</div>
            <div class="mt-1 text-xs text-tl-muted">
              {{ e.date }} · {{ e.category }} · {{ store.poolName(e.poolId) }}
            </div>
            <div class="mt-1 text-xs text-tl-muted">
              Paid by {{ store.participantName(e.paidById) }} ·
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
        <ExpenseReceipts
          class="mt-2"
          :trip-id="store.tripId"
          :expense-id="e.id"
        />
      </div>
    </div>
  </div>
</template>
