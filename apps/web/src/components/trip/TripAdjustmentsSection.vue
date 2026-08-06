<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import { formatPkr } from "@tripledger/engine";
import { useAdjustmentForm } from "@/composables/useAdjustmentForm";
import type { PaymentPrefill } from "@/composables/useTripTabs";
import { useWorkspaceStore } from "@/stores/workspace";

defineProps<{
  prefill?: PaymentPrefill | null;
}>();

defineEmits<{ consumedPrefill: [] }>();

const route = useRoute();
const router = useRouter();
const store = useWorkspaceStore();
const { adjustments } = storeToRefs(store);
const { confirmRemoveAdjustment, paymentLabel } = useAdjustmentForm();

function currentTripId() {
  return store.tripId || String(route.params.tripId ?? "");
}

function goAdd() {
  void router.push({
    name: "payment-new",
    params: { tripId: currentTripId() },
  });
}

function goEdit(adjustmentId: string) {
  void router.push({
    name: "payment-edit",
    params: { tripId: currentTripId(), adjustmentId },
  });
}
</script>

<template>
  <div class="space-y-4">
    <div class="tl-card">
      <div
        v-for="a in adjustments"
        :key="a.id"
        class="tl-list-row"
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
            @click="goEdit(a.id)"
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
        No payments yet.
      </p>
    </div>

    <button type="button" class="tl-fab" @click="goAdd">
      <i class="pi pi-wallet" aria-hidden="true" />
      Record payment
    </button>
  </div>
</template>
