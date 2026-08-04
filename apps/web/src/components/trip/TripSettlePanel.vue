<script setup lang="ts">
import { storeToRefs } from "pinia";
import Select from "primevue/select";
import { formatPkr } from "@tripledger/engine";
import type { SettlementRounding, TransferMode } from "@tripledger/types";
import { ROUNDING_MODES, TRANSFER_MODES } from "@/constants/tripOptions";
import { useWorkspaceStore } from "@/stores/workspace";

defineProps<{ visible: boolean }>();

const store = useWorkspaceStore();
const { trip, participants, settlement } = storeToRefs(store);
</script>

<template>
  <div v-show="visible" class="space-y-4">
    <div v-if="trip" class="tl-card grid gap-4">
      <div>
        <label class="tl-input-label">Transfer strategy</label>
        <Select
          :model-value="trip.transferMode"
          :options="TRANSFER_MODES"
          option-label="label"
          option-value="value"
          class="w-full"
          @update:model-value="
            (v) => store.updateSettlementSettings({ transferMode: v as TransferMode })
          "
        />
        <p class="mt-1 text-xs text-tl-muted">
          Minimize = fewest payments. Settle to one = everyone pays/receives via
          a hub. Pairwise = each debtor pays each creditor proportionally.
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
        <label class="tl-input-label">Hub person</label>
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
    </div>
    <div class="tl-card">
      <h2 class="tl-section-title">Preview</h2>
      <div
        v-for="(t, i) in settlement?.settlements ?? []"
        :key="i"
        class="tl-transfer-card mb-2"
      >
        <span class="text-sm">{{ t.fromName }} → {{ t.toName }}</span>
        <span class="font-semibold text-tl-accent-bright">{{
          formatPkr(t.amountPaisa)
        }}</span>
      </div>
      <p v-if="!(settlement?.settlements.length)" class="text-tl-muted text-sm">
        No transfers needed.
      </p>
    </div>
  </div>
</template>
