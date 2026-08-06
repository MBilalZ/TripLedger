<script setup lang="ts">
import { storeToRefs } from "pinia";
import { watch } from "vue";
import Button from "primevue/button";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import { formatPkr } from "@tripledger/engine";
import SplitMatrix from "@/components/SplitMatrix.vue";
import { SPLIT_MODES } from "@/constants/tripOptions";
import { useAdjustmentForm } from "@/composables/useAdjustmentForm";
import type { PaymentPrefill } from "@/composables/useTripTabs";
import { isEnabled } from "@/lib/features";
import { useWorkspaceStore } from "@/stores/workspace";

const props = defineProps<{
  prefill?: PaymentPrefill | null;
}>();

const emit = defineEmits<{ consumedPrefill: [] }>();

const store = useWorkspaceStore();
const { participants, adjustments } = storeToRefs(store);
const {
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
} = useAdjustmentForm();

watch(
  () => props.prefill,
  (p) => {
    if (!p) return;
    applyPrefill(p);
    emit("consumedPrefill");
  },
  { immediate: true },
);
</script>

<template>
  <div class="space-y-4">
    <div class="tl-card grid gap-3">
      <div class="flex items-center justify-between">
        <h3 class="tl-section-title mb-0">{{ adjFormTitle }}</h3>
        <Button
          v-if="editingAdjustmentId"
          label="Cancel"
          size="small"
          severity="secondary"
          text
          @click="clearAdjForm"
        />
      </div>
      <p class="text-sm text-tl-muted">
        Record settle-ups and cash moved outside expenses. If someone paid a
        shared bill, log that under Expenses (payer can be in the split).
      </p>

      <div>
        <label class="tl-input-label">Paid by</label>
        <Select
          v-model="paidById"
          :options="participants"
          option-label="displayName"
          option-value="id"
          placeholder="Who paid?"
          class="w-full tl-control"
        />
      </div>

      <div>
        <label class="tl-input-label">Amount (Rs)</label>
        <InputNumber
          v-model="amountRupees"
          class="w-full tl-control"
          :min-fraction-digits="0"
          :max-fraction-digits="2"
        />
      </div>

      <div v-if="editingAdjustmentId">
        <label class="tl-input-label">Received by</label>
        <Select
          v-model="editReceivedById"
          :options="recipientOptions"
          option-label="displayName"
          option-value="id"
          placeholder="Who received?"
          class="w-full tl-control"
        />
      </div>

      <div v-else class="space-y-2">
        <label class="tl-input-label">Split with</label>
        <p class="text-xs text-tl-muted">
          Include everyone this payment covers. The payer can be included; their
          share is not recorded as a transfer.
        </p>
        <ul class="split-with-list">
          <li v-for="p in splitPeople" :key="p.participantId">
            <label class="split-with-row">
              <input
                type="checkbox"
                :checked="p.included"
                :aria-label="`Include ${p.displayName}`"
                @change="
                  toggleIncluded(
                    p.participantId,
                    ($event.target as HTMLInputElement).checked,
                  )
                "
              />
              <span>{{ p.displayName }}</span>
              <span
                v-if="p.participantId === paidById"
                class="text-xs text-tl-muted"
              >
                (payer)
              </span>
            </label>
          </li>
        </ul>
      </div>

      <div
        v-if="paymentPreview && !showSplitControls"
        class="rounded-md border border-tl-hairline bg-tl-elevated px-3 py-2 text-sm text-tl"
      >
        {{ paymentPreview }}
      </div>

      <template v-if="showSplitControls && isEnabled('advanced_splits')">
        <div>
          <label class="tl-input-label">How to split</label>
          <Select
            v-model="splitMode"
            :options="SPLIT_MODES"
            option-label="label"
            option-value="value"
            class="w-full tl-control"
          />
          <p v-if="paymentPreview" class="mt-1 text-xs text-tl-muted">
            {{ paymentPreview }}
          </p>
        </div>
        <!-- Weights only for included people; inclusion stays on the checklist above -->
        <SplitMatrix
          :mode="splitMode"
          :people="splitPeople.filter((p) => p.included)"
          :total-paisa="Math.round(Number(amountRupees ?? 0) * 100)"
          lock-included
          @change="onSplitPersonChange"
        />
      </template>

      <div>
        <label class="tl-input-label">Note</label>
        <InputText
          v-model="reason"
          class="w-full tl-control"
          placeholder="Optional"
        />
      </div>

      <div class="flex flex-wrap gap-2">
        <Button
          :label="editingAdjustmentId ? 'Save payment' : 'Record payment'"
          :icon="editingAdjustmentId ? 'pi pi-check' : 'pi pi-plus'"
          type="button"
          @click="onSaveAdj"
        />
      </div>
    </div>

    <div class="tl-card">
      <div
        v-for="a in adjustments"
        :key="a.id"
        class="tl-list-row"
        :class="{ 'is-editing': editingAdjustmentId === a.id }"
      >
        <div class="min-w-0 text-sm">
          <div>{{ paymentLabel(a.fromId, a.toId) }}</div>
          <div class="font-medium text-tl-accent-bright">
            {{ formatPkr(a.amountPaisa) }}
          </div>
          <div v-if="a.reason" class="text-xs text-tl-muted">{{ a.reason }}</div>
          <div v-if="a.groupId" class="text-xs text-tl-muted">Split payment</div>
        </div>
        <div class="flex gap-1">
          <Button
            icon="pi pi-pencil"
            text
            rounded
            aria-label="Edit payment"
            @click="startEditAdjustment(a.id)"
          />
          <Button
            icon="pi pi-times"
            text
            severity="danger"
            aria-label="Delete payment"
            @click="confirmRemoveAdjustment(a.id)"
          />
        </div>
      </div>
      <p v-if="!adjustments.length" class="text-sm text-tl-muted">
        No payments yet. Use this for amounts outside expenses and pools that
        should still affect Settle up.
      </p>
    </div>
  </div>
</template>

<style scoped>
.split-with-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--tl-hairline, #e5e7eb);
  border-radius: 0.5rem;
  overflow: hidden;
}

.split-with-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.65rem 0.85rem;
  border-bottom: 1px solid var(--tl-hairline, #e5e7eb);
  cursor: pointer;
  font-size: 0.95rem;
}

.split-with-list li:last-child .split-with-row {
  border-bottom: none;
}

.split-with-row input {
  width: 1.05rem;
  height: 1.05rem;
  accent-color: var(--tl-accent, #0f766e);
}
</style>
