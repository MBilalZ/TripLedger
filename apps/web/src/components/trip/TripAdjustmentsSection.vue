<script setup lang="ts">
import { storeToRefs } from "pinia";
import Button from "primevue/button";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
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
  adjMode,
  adjSplitMode,
  adjDebtors,
  adjForm,
  adjFormTitle,
  clearAdjForm,
  startEditAdjustment,
  onSaveAdj,
  confirmRemoveAdjustment,
  onDebtorChange,
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
        Use expenses for trip spending. Use adjustments for prior payments or
        remainders between people.
      </p>
      <div v-if="!editingAdjustmentId" class="flex flex-wrap gap-2">
        <Button
          label="Simple (A owes B)"
          size="small"
          :severity="adjMode === 'simple' ? undefined : 'secondary'"
          :outlined="adjMode !== 'simple'"
          @click="adjMode = 'simple'"
        />
        <Button
          label="Split a total"
          size="small"
          :severity="adjMode === 'split' ? undefined : 'secondary'"
          :outlined="adjMode !== 'split'"
          @click="adjMode = 'split'"
        />
      </div>
      <template v-if="adjMode === 'simple' || editingAdjustmentId">
        <div>
          <label class="tl-input-label">From (owes)</label>
          <Select
            v-model="adjForm.fromId"
            :options="participants"
            option-label="displayName"
            option-value="id"
            placeholder="Select person"
            class="w-full"
          />
        </div>
        <div>
          <label class="tl-input-label">To (is owed)</label>
          <Select
            v-model="adjForm.toId"
            :options="participants"
            option-label="displayName"
            option-value="id"
            placeholder="Select person"
            class="w-full"
          />
        </div>
      </template>
      <template v-else>
        <div>
          <label class="tl-input-label">Creditor (is owed)</label>
          <Select
            v-model="adjForm.creditorId"
            :options="participants"
            option-label="displayName"
            option-value="id"
            placeholder="Select person"
            class="w-full"
          />
        </div>
        <div>
          <label class="tl-input-label">Split among debtors</label>
          <Select
            v-model="adjSplitMode"
            :options="SPLIT_MODES"
            option-label="label"
            option-value="value"
            class="w-full"
          />
        </div>
        <SplitMatrix
          :mode="adjSplitMode"
          :people="adjDebtors"
          :total-paisa="Math.round(Number(adjForm.amountRupees ?? 0) * 100)"
          @change="onDebtorChange"
        />
      </template>
      <div>
        <label class="tl-input-label">Amount (Rs)</label>
        <InputNumber
          v-model="adjForm.amountRupees"
          class="w-full"
          :min-fraction-digits="0"
          :max-fraction-digits="2"
        />
      </div>
      <div>
        <label class="tl-input-label">Reason</label>
        <InputText v-model="adjForm.reason" class="w-full" />
      </div>
      <div class="flex flex-wrap gap-2">
        <Button
          :label="editingAdjustmentId ? 'Save adjustment' : 'Add adjustment'"
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
          <div>
            {{ store.participantName(a.fromId) }} →
            {{ store.participantName(a.toId) }}
          </div>
          <div class="font-medium text-tl-accent-bright">
            {{ formatPkr(a.amountPaisa) }}
          </div>
          <div v-if="a.reason" class="text-xs text-tl-muted">{{ a.reason }}</div>
        </div>
        <div class="flex gap-1">
          <Button
            icon="pi pi-pencil"
            text
            rounded
            @click="startEditAdjustment(a.id)"
          />
          <Button
            icon="pi pi-times"
            text
            severity="danger"
            aria-label="Delete adjustment"
            @click="confirmRemoveAdjustment(a.id)"
          />
        </div>
      </div>
      <p v-if="!adjustments.length" class="text-sm text-tl-muted">
        No adjustments yet.
      </p>
    </div>
  </div>
</template>
