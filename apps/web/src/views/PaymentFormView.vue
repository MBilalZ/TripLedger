<script setup lang="ts">
import { onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import SplitMatrix from "@/components/SplitMatrix.vue";
import { SPLIT_MODES } from "@/constants/tripOptions";
import { useAdjustmentForm } from "@/composables/useAdjustmentForm";
import { useTripWorkspace } from "@/composables/useTripWorkspace";
import { isEnabled } from "@/lib/features";
import { storeToRefs } from "pinia";
import { useWorkspaceStore } from "@/stores/workspace";

const props = defineProps<{ tripId: string; adjustmentId?: string }>();
const route = useRoute();
const router = useRouter();

useTripWorkspace(() => props.tripId);
const store = useWorkspaceStore();
const { participants, loading, trip } = storeToRefs(store);

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
  onSplitPersonChange,
  toggleIncluded,
} = useAdjustmentForm({
  onClose: () => {
    void router.push({ name: "trip", params: { tripId: props.tripId } });
  },
});

function cancel() {
  clearAdjForm();
  void router.push({ name: "trip", params: { tripId: props.tripId } });
}

function boot() {
  if (loading.value || !trip.value) return;
  if (props.adjustmentId) {
    startEditAdjustment(props.adjustmentId);
    if (!editingAdjustmentId.value) {
      void router.replace({ name: "trip", params: { tripId: props.tripId } });
    }
    return;
  }
  clearAdjForm();
  const q = route.query;
  const paid = typeof q.paidById === "string" ? q.paidById : "";
  const received = typeof q.receivedById === "string" ? q.receivedById : "";
  const amount = Number(q.amountRupees ?? 0);
  if (paid && received && amount > 0) {
    applyPrefill({
      paidById: paid,
      receivedById: received,
      amountRupees: amount,
      reason: typeof q.reason === "string" ? q.reason : "Settle up",
    });
  }
}

onMounted(() => {
  boot();
});

watch(
  () => [props.adjustmentId, loading.value, trip.value?.id, route.query] as const,
  () => {
    boot();
  },
);
</script>

<template>
  <div v-if="loading" class="text-tl-muted" role="status">Loading…</div>
  <div v-else-if="!trip" class="tl-card">Group not found.</div>
  <div v-else class="space-y-4">
    <div class="tl-card grid gap-3">
      <div class="flex items-center justify-between gap-2">
        <h3 class="tl-section-title mb-0">{{ adjFormTitle }}</h3>
        <Button
          label="Cancel"
          size="small"
          severity="secondary"
          text
          @click="cancel"
        />
      </div>
      <p class="text-sm text-tl-muted">
        Record settle-ups and cash moved outside expenses. Shared bills belong
        under Expenses.
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
        <Button label="Cancel" severity="secondary" outlined @click="cancel" />
      </div>
    </div>
  </div>
</template>
