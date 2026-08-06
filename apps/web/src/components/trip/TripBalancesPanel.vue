<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed } from "vue";
import Button from "primevue/button";
import { formatPkr, paisaToRupees } from "@tripledger/engine";
import { useTripCharts } from "@/composables/useTripCharts";
import { isEnabled } from "@/lib/features";
import { useWorkspaceStore } from "@/stores/workspace";

defineProps<{
  visible: boolean;
  formatTransferAmount: (amountRupees: number) => string;
}>();

const emit = defineEmits<{
  recordPayment: [
    payload: { paidById: string; receivedById: string; amountRupees: number },
  ];
}>();

const store = useWorkspaceStore();
const { expenses, pools, settlement } = storeToRefs(store);
const {
  chartByCategory,
  chartByPool,
  chartByPersonPaid,
  chartByPersonShare,
} = useTripCharts(expenses, pools, settlement);
const balanced = computed(() => settlement.value?.consistency.ok ?? false);
const sortedParticipants = computed(() => {
  const list = settlement.value?.participants ?? [];
  return [...list].sort((a, b) => {
    const byName = a.displayName.localeCompare(b.displayName, undefined, {
      sensitivity: "base",
    });
    if (byName !== 0) return byName;
    return a.participantId.localeCompare(b.participantId);
  });
});

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
      <h2 class="tl-section-title">Per friend</h2>
      <div
        v-for="p in sortedParticipants"
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
        Add friends to see balances.
      </p>
    </div>

    <div v-if="isEnabled('charts')" class="tl-card space-y-4">
      <h2 class="tl-section-title">Charts</h2>

      <div>
        <h3 class="mb-2 text-sm text-tl-muted">By pool</h3>
        <div class="space-y-2">
          <div v-for="c in chartByPool" :key="`pool-${c.name}`">
            <div class="mb-1 flex justify-between text-xs text-tl-muted">
              <span>{{ c.name }}</span>
              <span>{{ formatPkr(c.paisa, 0) }} · {{ c.pct }}%</span>
            </div>
            <div class="tl-bar-track">
              <div class="tl-bar-fill" :style="{ width: `${c.pct}%` }" />
            </div>
          </div>
          <p v-if="!chartByPool.length" class="text-xs text-tl-muted">
            No pool spend yet.
          </p>
        </div>
      </div>

      <div>
        <h3 class="mb-2 text-sm text-tl-muted">By category</h3>
        <div class="space-y-2">
          <div v-for="c in chartByCategory" :key="`cat-${c.name}`">
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

      <div>
        <h3 class="mb-2 text-sm text-tl-muted">Paid by person</h3>
        <div class="space-y-2">
          <div v-for="c in chartByPersonPaid" :key="`paid-${c.name}`">
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

      <div>
        <h3 class="mb-2 text-sm text-tl-muted">Share by person</h3>
        <div class="space-y-2">
          <div v-for="c in chartByPersonShare" :key="`share-${c.name}`">
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
          <div class="min-w-0 flex-1">
            <span
              ><strong>{{ t.fromName }}</strong> →
              <strong>{{ t.toName }}</strong></span
            >
            <div class="text-lg font-semibold text-tl-accent-bright">
              Rs. {{ formatTransferAmount(t.amountRupees) }}
            </div>
          </div>
          <Button
            label="Record"
            size="small"
            text
            @click="recordAsPayment(t)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
