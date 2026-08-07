<script setup lang="ts">
import { onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import InputNumber from "primevue/inputnumber";
import Select from "primevue/select";
import AppLoading from "@/components/AppLoading.vue";
import SplitMatrix from "@/components/SplitMatrix.vue";
import TlButton from "@/components/ui/TlButton.vue";
import TlInput from "@/components/ui/TlInput.vue";
import TlLabel from "@/components/ui/TlLabel.vue";
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
  <AppLoading v-if="loading && (!trip || trip.id !== tripId)" />
  <div v-else-if="!trip || trip.id !== tripId" class="tl-card">Group not found.</div>
  <div v-else class="space-y-4">
    <div class="tl-card grid gap-3">
      <div class="flex items-center justify-between gap-2">
        <h3 class="tl-section-title mb-0">{{ adjFormTitle }}</h3>
        <TlButton label="Cancel" variant="text" @click="cancel" />
      </div>
      <p class="text-sm text-tl-muted">
        Record settle-ups and cash moved outside expenses. Shared bills belong
        under Expenses.
      </p>

      <div>
        <TlLabel>Paid by</TlLabel>
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
        <TlLabel>Amount (Rs)</TlLabel>
        <InputNumber
          v-model="amountRupees"
          class="w-full"
          :min-fraction-digits="0"
          :max-fraction-digits="2"
        />
      </div>

      <div v-if="editingAdjustmentId">
        <TlLabel>Received by</TlLabel>
        <Select
          v-model="editReceivedById"
          :options="recipientOptions"
          option-label="displayName"
          option-value="id"
          placeholder="Who received?"
          class="w-full"
        />
      </div>

      <div v-else class="space-y-2">
        <TlLabel>Split with</TlLabel>
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
          <TlLabel>How to split</TlLabel>
          <Select
            v-model="splitMode"
            :options="SPLIT_MODES"
            option-label="label"
            option-value="value"
            class="w-full"
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
        <TlLabel>Note</TlLabel>
        <TlInput v-model="reason" placeholder="Optional" />
      </div>

      <div class="flex flex-wrap gap-2">
        <TlButton
          :label="editingAdjustmentId ? 'Save payment' : 'Record payment'"
          :icon="editingAdjustmentId ? 'check' : 'plus'"
          type="button"
          @click="onSaveAdj"
        />
      </div>
    </div>
  </div>
</template>
