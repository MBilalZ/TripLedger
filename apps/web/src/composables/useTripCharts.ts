import type { SettleTripResult } from "@tripledger/types";
import { computed, type Ref } from "vue";
import type { ExpenseRow, PoolRow } from "@/db/dexie";
import {
  buildTripReportCharts,
  type ChartSlice,
} from "@/lib/tripReport";

export type { ChartSlice };

export function useTripCharts(
  expenses: Ref<ExpenseRow[]>,
  pools?: Ref<PoolRow[]>,
  settlement?: Ref<SettleTripResult | null>,
) {
  const charts = computed(() =>
    buildTripReportCharts(
      expenses.value,
      pools?.value ?? [],
      settlement?.value,
    ),
  );

  const chartByCategory = computed(() => charts.value.byCategory);
  const chartByPool = computed(() => charts.value.byPool);
  const chartByPersonPaid = computed(() => charts.value.byPersonPaid);
  const chartByPersonShare = computed(() => charts.value.byPersonShare);

  return {
    chartByCategory,
    chartByPool,
    chartByPersonPaid,
    chartByPersonShare,
  };
}
