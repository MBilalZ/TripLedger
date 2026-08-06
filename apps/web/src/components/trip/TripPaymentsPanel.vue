<script setup lang="ts">
import type { PaymentPrefill } from "@/composables/useTripTabs";
import TripAdjustmentsSection from "./TripAdjustmentsSection.vue";

defineProps<{
  visible: boolean;
  prefill: PaymentPrefill | null;
}>();

const emit = defineEmits<{ consumedPrefill: [] }>();
</script>

<template>
  <div v-show="visible" class="space-y-4">
    <div class="tl-card">
      <h2 class="tl-section-title mb-1">Payments</h2>
      <p class="text-sm text-tl-muted">
        Record settle-ups and cash outside expenses. Split with can include the
        payer; only others get transfer rows. Shared bills belong under Expenses.
      </p>
    </div>
    <TripAdjustmentsSection
      :prefill="prefill"
      @consumed-prefill="emit('consumedPrefill')"
    />
  </div>
</template>
