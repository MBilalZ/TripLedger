<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { formatPkr } from "@tripledger/engine";
import { useTripCharts } from "@/composables/useTripCharts";
import { useWorkspaceStore } from "@/stores/workspace";

defineProps<{
  visible: boolean;
  formatTransferAmount: (amountRupees: number) => string;
}>();

const store = useWorkspaceStore();
const { expenses, settlement } = storeToRefs(store);
const { chartByCategory } = useTripCharts(expenses);
const balanced = computed(() => settlement.value?.consistency.ok ?? false);
</script>

<template>
  <div v-show="visible" class="space-y-4">
    <div class="tl-card">
      <h2 class="tl-section-title">Per person</h2>
      <div
        v-for="p in settlement?.participants ?? []"
        :key="p.participantId"
        class="tl-list-row"
      >
        <div class="min-w-0">
          <div class="font-medium text-tl">{{ p.displayName }}</div>
          <div class="text-xs text-tl-muted">
            Paid {{ formatPkr(p.paidPaisa, 0) }} · Share
            {{ formatPkr(p.sharePaisa) }}
            <template v-if="p.adjNetPaisa">
              · Adj {{ formatPkr(p.adjNetPaisa) }}
            </template>
          </div>
        </div>
        <div
          class="font-semibold"
          :class="p.balancePaisa >= 0 ? 'money-pos' : 'money-neg'"
        >
          {{ formatPkr(p.balancePaisa) }}
        </div>
      </div>
      <p v-if="!(settlement?.participants.length)" class="text-sm text-tl-muted">
        Add people to see balances.
      </p>
    </div>

    <div class="tl-card">
      <h2 class="tl-section-title">Pools</h2>
      <div
        v-for="p in settlement?.pools ?? []"
        :key="p.poolId"
        class="tl-list-row"
      >
        <span class="text-sm"
          >{{ p.name }}
          <span class="text-tl-muted"
            >({{ p.splitMode
            }}{{ p.headCount ? ` · ${p.headCount}` : "" }})</span
          ></span
        >
        <span class="font-medium">{{ formatPkr(p.totalPaisa, 0) }}</span>
      </div>
      <h3 class="mb-2 mt-4 text-sm text-tl-muted">By category</h3>
      <div class="space-y-2">
        <div v-for="c in chartByCategory" :key="c.name">
          <div class="mb-1 flex justify-between text-xs text-tl-muted">
            <span>{{ c.name }}</span>
            <span>{{ formatPkr(c.paisa, 0) }} · {{ c.pct }}%</span>
          </div>
          <div class="tl-bar-track">
            <div class="tl-bar-fill" :style="{ width: `${c.pct}%` }" />
          </div>
        </div>
      </div>
    </div>

    <div class="tl-card">
      <h2 class="tl-section-title">Who pays whom</h2>
      <div v-if="!balanced" class="tl-alert mb-3">
        <div class="font-medium">Settlement blocked</div>
        <ul class="mt-1 list-disc pl-5">
          <li
            v-for="(v, i) in settlement?.consistency.violations ?? []"
            :key="i"
          >
            {{ v.id }}: {{ v.message }}
          </li>
        </ul>
      </div>
      <div
        v-else-if="!(settlement?.settlements.length)"
        class="text-tl-muted text-sm"
      >
        All settled — nothing to pay.
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="(t, i) in settlement?.settlements"
          :key="i"
          class="tl-transfer-card"
        >
          <span
            ><strong>{{ t.fromName }}</strong> →
            <strong>{{ t.toName }}</strong></span
          >
          <span class="text-lg font-semibold text-tl-accent-bright">
            Rs. {{ formatTransferAmount(t.amountRupees) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
