<script setup lang="ts">
import { onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import Textarea from "primevue/textarea";
import AppLoading from "@/components/AppLoading.vue";
import SplitMatrix from "@/components/SplitMatrix.vue";
import { EXPENSE_CATEGORIES, SPLIT_MODES } from "@/constants/tripOptions";
import { useExpenseForm } from "@/composables/useExpenseForm";
import { useTripWorkspace } from "@/composables/useTripWorkspace";
import { isEnabled } from "@/lib/features";
import { storeToRefs } from "pinia";
import { useWorkspaceStore } from "@/stores/workspace";

const props = defineProps<{ tripId: string; expenseId?: string }>();
const route = useRoute();
const router = useRouter();

useTripWorkspace(() => props.tripId);
const store = useWorkspaceStore();
const { participants, pools, loading, trip } = storeToRefs(store);

const {
  editingExpenseId,
  useCustomSplit,
  customSplitMode,
  customSplits,
  expenseForm,
  expenseFormTitle,
  canAddExpenses,
  selectedPool,
  clearExpenseForm,
  startEditExpense,
  openAddExpense,
  onSaveExpense,
  onCustomSplitChange,
} = useExpenseForm({
  onClose: () => {
    void router.push({ name: "trip", params: { tripId: props.tripId } });
  },
});

function cancel() {
  clearExpenseForm();
  void router.push({ name: "trip", params: { tripId: props.tripId } });
}

function boot() {
  if (loading.value || !trip.value) return;
  if (props.expenseId) {
    startEditExpense(props.expenseId);
    if (!editingExpenseId.value) {
      void router.replace({ name: "trip", params: { tripId: props.tripId } });
    }
  } else {
    openAddExpense();
  }
}

onMounted(() => {
  boot();
});

watch(
  () => [props.expenseId, loading.value, trip.value?.id] as const,
  () => {
    boot();
  },
);
</script>

<template>
  <AppLoading v-if="loading && (!trip || trip.id !== tripId)" />
  <div v-else-if="!trip || trip.id !== tripId" class="tl-card">Group not found.</div>
  <div v-else-if="!canAddExpenses" class="tl-card space-y-3">
    <h3 class="tl-section-title mb-0">Add friends first</h3>
    <p class="text-sm text-tl-muted">
      Add at least one friend before logging expenses.
    </p>
    <Button label="Back" severity="secondary" @click="cancel" />
  </div>
  <div v-else class="space-y-4">
    <div class="tl-card grid gap-3">
      <div class="flex items-center justify-between gap-2">
        <h3 class="tl-section-title mb-0">{{ expenseFormTitle }}</h3>
        <Button
          label="Cancel"
          size="small"
          severity="secondary"
          text
          @click="cancel"
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

      <div v-if="isEnabled('advanced_splits')" class="flex items-center gap-2">
        <Checkbox v-model="useCustomSplit" binary input-id="custom-split" />
        <label for="custom-split" class="text-sm">
          Custom split (override pool default)
        </label>
      </div>
      <div
        v-if="useCustomSplit && isEnabled('advanced_splits')"
        class="space-y-3"
      >
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
        <Button label="Cancel" severity="secondary" outlined @click="cancel" />
      </div>
    </div>
    <p v-if="route.name === 'expense-edit'" class="text-xs text-tl-muted">
      Tip: use Back or Cancel to discard without saving.
    </p>
  </div>
</template>
