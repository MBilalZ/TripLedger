<script setup lang="ts">
import { storeToRefs } from "pinia";
import Button from "primevue/button";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import MultiSelect from "primevue/multiselect";
import Select from "primevue/select";
import { formatPkr } from "@tripledger/engine";
import SplitMatrix from "@/components/SplitMatrix.vue";
import { SPLIT_MODES } from "@/constants/tripOptions";
import { useAdjustmentForm } from "@/composables/useAdjustmentForm";
import { useWorkspaceStore } from "@/stores/workspace";

const store = useWorkspaceStore();
const { participants, adjustments } = storeToRefs(store);
const {
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
} = useAdjustmentForm();
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
        Record money moved outside expenses and pools — prior cash, IOUs, or
        settle-ups already paid — so Settle up stays accurate.
      </p>

      <div>
        <label class="tl-input-label">Paid by</label>
        <Select
          v-model="paidById"
          :options="participants"
          option-label="displayName"
          option-value="id"
          placeholder="Who paid?"
          class="w-full"
        />
      </div>

      <div>
        <label class="tl-input-label">Amount (Rs)</label>
        <InputNumber
          v-model="amountRupees"
          class="w-full"
          :min-fraction-digits="0"
          :max-fraction-digits="2"
        />
      </div>

      <div>
        <label class="tl-input-label">Note</label>
        <InputText
          v-model="reason"
          class="w-full"
          placeholder="Optional"
        />
      </div>

      <div>
        <label class="tl-input-label">Received by</label>
        <Select
          v-if="editingAdjustmentId"
          v-model="editReceivedById"
          :options="recipientOptions"
          option-label="displayName"
          option-value="id"
          placeholder="Who received?"
          class="w-full"
        />
        <MultiSelect
          v-else
          v-model="receivedByIds"
          :options="recipientOptions"
          option-label="displayName"
          option-value="id"
          placeholder="One or more friends"
          display="chip"
          class="w-full"
          :filter="recipientOptions.length > 6"
        />
      </div>

      <template v-if="showSplitControls">
        <div>
          <label class="tl-input-label">Split among recipients</label>
          <Select
            v-model="splitMode"
            :options="SPLIT_MODES"
            option-label="label"
            option-value="value"
            class="w-full"
          />
        </div>
        <SplitMatrix
          :mode="splitMode"
          :people="recipientSplits"
          :total-paisa="Math.round(Number(amountRupees ?? 0) * 100)"
          @change="onRecipientSplitChange"
        />
      </template>

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
