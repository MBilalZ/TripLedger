<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import { formatPkr } from "@tripledger/engine";
import { useExpenseForm } from "@/composables/useExpenseForm";
import { useWorkspaceStore } from "@/stores/workspace";

defineProps<{ visible: boolean }>();
const emit = defineEmits<{ openFriends: [] }>();

const route = useRoute();
const router = useRouter();
const store = useWorkspaceStore();
const { canAddExpenses, reversedExpenses, confirmVoidExpense } = useExpenseForm();

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

function currentTripId() {
  return store.tripId || String(route.params.tripId ?? "");
}

function goAdd() {
  void router.push({
    name: "expense-new",
    params: { tripId: currentTripId() },
  });
}

function goEdit(expenseId: string) {
  void router.push({
    name: "expense-edit",
    params: { tripId: currentTripId(), expenseId },
  });
}
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
      <div class="tl-card">
        <h3 class="tl-section-title">Expenses</h3>
        <p v-if="!reversedExpenses.length" class="text-sm text-tl-muted">
          No expenses yet. Choose a pool first — that decides who shares.
        </p>
        <template v-for="group in groupedExpenses" :key="group.date">
          <div class="tl-date-group">{{ group.date }}</div>
          <div v-for="e in group.items" :key="e.id" class="tl-expense-card">
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
                    aria-label="Edit expense"
                    @click="goEdit(e.id)"
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

      <button type="button" class="tl-fab" @click="goAdd">
        <i class="pi pi-receipt" aria-hidden="true" />
        Add expense
      </button>
    </template>
  </div>
</template>
