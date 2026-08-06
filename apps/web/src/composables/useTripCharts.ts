import type { SettleTripResult } from "@tripledger/types";
import { computed, type Ref } from "vue";
import type { ExpenseRow, PoolRow } from "@/db/dexie";

export type ChartSlice = {
  name: string;
  paisa: number;
  pct: number;
};

function toSlices(map: Map<string, number>): ChartSlice[] {
  const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
  return [...map.entries()]
    .map(([name, paisa]) => ({
      name,
      paisa,
      pct: Math.round((paisa / total) * 100),
    }))
    .sort((a, b) => b.paisa - a.paisa);
}

export function useTripCharts(
  expenses: Ref<ExpenseRow[]>,
  pools?: Ref<PoolRow[]>,
  settlement?: Ref<SettleTripResult | null>,
) {
  const chartByCategory = computed(() => {
    const map = new Map<string, number>();
    for (const e of expenses.value) {
      map.set(e.category || "Misc", (map.get(e.category || "Misc") ?? 0) + e.amountPaisa);
    }
    return toSlices(map);
  });

  const chartByPool = computed(() => {
    const nameById = new Map((pools?.value ?? []).map((p) => [p.id, p.name]));
    const map = new Map<string, number>();
    for (const e of expenses.value) {
      const name = nameById.get(e.poolId) ?? "Pool";
      map.set(name, (map.get(name) ?? 0) + e.amountPaisa);
    }
    return toSlices(map);
  });

  const chartByPersonPaid = computed(() => {
    const list = settlement?.value?.participants ?? [];
    const map = new Map<string, number>();
    for (const p of list) {
      if (p.paidPaisa > 0) map.set(p.displayName, p.paidPaisa);
    }
    return toSlices(map);
  });

  const chartByPersonShare = computed(() => {
    const list = settlement?.value?.participants ?? [];
    const map = new Map<string, number>();
    for (const p of list) {
      if (p.sharePaisa > 0) map.set(p.displayName, p.sharePaisa);
    }
    return toSlices(map);
  });

  return {
    chartByCategory,
    chartByPool,
    chartByPersonPaid,
    chartByPersonShare,
  };
}
