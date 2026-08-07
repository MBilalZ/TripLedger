import type { ParticipantMoney, SettleTripResult } from "@tripledger/types";

export type ChartSlice = {
  name: string;
  paisa: number;
  pct: number;
};

export type ExpenseForCharts = {
  category?: string;
  amountPaisa: number;
  poolId: string;
};

export type PoolForCharts = {
  id: string;
  name: string;
};

export type TripReportCharts = {
  byPool: ChartSlice[];
  byCategory: ChartSlice[];
  byPersonPaid: ChartSlice[];
  byPersonShare: ChartSlice[];
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

export function chartSlicesByCategory(expenses: ExpenseForCharts[]): ChartSlice[] {
  const map = new Map<string, number>();
  for (const e of expenses) {
    const key = e.category || "Misc";
    map.set(key, (map.get(key) ?? 0) + e.amountPaisa);
  }
  return toSlices(map);
}

export function chartSlicesByPool(
  expenses: ExpenseForCharts[],
  pools: PoolForCharts[],
): ChartSlice[] {
  const nameById = new Map(pools.map((p) => [p.id, p.name]));
  const map = new Map<string, number>();
  for (const e of expenses) {
    const name = nameById.get(e.poolId) ?? "Pool";
    map.set(name, (map.get(name) ?? 0) + e.amountPaisa);
  }
  return toSlices(map);
}

export function chartSlicesByPersonPaid(participants: ParticipantMoney[]): ChartSlice[] {
  const map = new Map<string, number>();
  for (const p of participants) {
    if (p.paidPaisa > 0) map.set(p.displayName, p.paidPaisa);
  }
  return toSlices(map);
}

export function chartSlicesByPersonShare(participants: ParticipantMoney[]): ChartSlice[] {
  const map = new Map<string, number>();
  for (const p of participants) {
    if (p.sharePaisa > 0) map.set(p.displayName, p.sharePaisa);
  }
  return toSlices(map);
}

export function buildTripReportCharts(
  expenses: ExpenseForCharts[],
  pools: PoolForCharts[],
  settlement: SettleTripResult | null | undefined,
): TripReportCharts {
  const participants = settlement?.participants ?? [];
  return {
    byPool: chartSlicesByPool(expenses, pools),
    byCategory: chartSlicesByCategory(expenses),
    byPersonPaid: chartSlicesByPersonPaid(participants),
    byPersonShare: chartSlicesByPersonShare(participants),
  };
}
