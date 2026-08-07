<script setup lang="ts">
import { storeToRefs } from "pinia";
import { formatPkr, paisaToRupees } from "@tripledger/engine";
import { useWorkspaceStore } from "@/stores/workspace";
import TlButton from "@/components/ui/TlButton.vue";

defineProps<{ visible: boolean }>();

const emit = defineEmits<{
  recordPayment: [
    payload: { paidById: string; receivedById: string; amountRupees: number },
  ];
}>();

const store = useWorkspaceStore();
const { settlement } = storeToRefs(store);

function recordAsPayment(t: {
  fromId: string;
  toId: string;
  amountPaisa: number;
}) {
  emit("recordPayment", {
    paidById: t.fromId,
    receivedById: t.toId,
    amountRupees: paisaToRupees(t.amountPaisa),
  });
}
</script>

<template>
  <div v-show="visible" class="space-y-4">
    <div class="tl-card">
      <h2 class="tl-section-title mb-1">Settle up</h2>
      <p class="text-sm text-tl-muted">
        Suggested transfers from expenses, pools, and payments. Record a transfer
        when cash actually moves.
      </p>
    </div>

    <div class="tl-card">
      <h2 class="tl-section-title">Suggested transfers</h2>
      <div
        v-for="(t, i) in settlement?.settlements ?? []"
        :key="i"
        class="tl-transfer-card mb-2"
      >
        <div class="min-w-0 flex-1">
          <div class="text-sm">
            <strong>{{ t.fromName }}</strong> pays
            <strong>{{ t.toName }}</strong>
          </div>
          <div class="mt-1 text-lg font-semibold text-tl-accent-bright">
            {{ formatPkr(t.amountPaisa) }}
          </div>
        </div>
        <TlButton
          label="Record"
          icon="wallet"
          variant="outlined"
          @click="recordAsPayment(t)"
        />
      </div>
      <p v-if="!(settlement?.settlements.length)" class="text-tl-muted text-sm">
        No transfers needed — everyone is settled.
      </p>
    </div>
  </div>
</template>
