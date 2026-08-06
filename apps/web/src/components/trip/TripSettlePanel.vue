<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed } from "vue";
import Button from "primevue/button";
import Select from "primevue/select";
import { formatPkr, paisaToRupees } from "@tripledger/engine";
import type { SettlementRounding, TransferMode } from "@tripledger/types";
import { ROUNDING_MODES, TRANSFER_MODES } from "@/constants/tripOptions";
import { isEnabled } from "@/lib/features";
import { useWorkspaceStore } from "@/stores/workspace";

defineProps<{ visible: boolean }>();

const emit = defineEmits<{
  recordPayment: [
    payload: { paidById: string; receivedById: string; amountRupees: number },
  ];
}>();

const store = useWorkspaceStore();
const { trip, participants, settlement, isOwner } = storeToRefs(store);
const useRounded = computed(
  () => (trip.value?.settlementRounding ?? "rupee") === "rupee",
);

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

    <div
      v-if="trip && isEnabled('settlement_modes')"
      class="tl-card grid gap-4"
    >
      <template v-if="isOwner">
        <div>
          <label class="tl-input-label">Transfer strategy</label>
          <Select
            :model-value="trip.transferMode"
            :options="TRANSFER_MODES"
            option-label="label"
            option-value="value"
            class="w-full"
            @update:model-value="
              (v) =>
                store.updateSettlementSettings({ transferMode: v as TransferMode })
            "
          />
          <p class="mt-1 text-xs text-tl-muted">
            Minimize = fewest transfers. Settle to one = everyone pays/receives via
            a hub.
          </p>
        </div>
        <div>
          <label class="tl-input-label">Rounding</label>
          <Select
            :model-value="trip.settlementRounding"
            :options="ROUNDING_MODES"
            option-label="label"
            option-value="value"
            class="w-full"
            @update:model-value="
              (v) =>
                store.updateSettlementSettings({
                  settlementRounding: v as SettlementRounding,
                })
            "
          />
        </div>
        <div v-if="trip.transferMode === 'settle_to_one'">
          <label class="tl-input-label">Hub friend</label>
          <Select
            :model-value="trip.settlementHubId ?? ''"
            :options="[
              { id: '', displayName: 'Largest creditor (auto)' },
              ...participants,
            ]"
            option-label="displayName"
            option-value="id"
            class="w-full"
            @update:model-value="
              (v) =>
                store.updateSettlementSettings({
                  settlementHubId: v ? String(v) : null,
                })
            "
          />
        </div>
      </template>
      <p v-else class="text-sm text-tl-muted">
        Settlement settings are managed by the group owner.
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
            {{ formatPkr(t.amountPaisa, useRounded ? 0 : undefined) }}
          </div>
        </div>
        <Button
          label="Record"
          icon="pi pi-wallet"
          outlined
          @click="recordAsPayment(t)"
        />
      </div>
      <p v-if="!(settlement?.settlements.length)" class="text-tl-muted text-sm">
        No transfers needed — everyone is settled.
      </p>
    </div>
  </div>
</template>
