import { computed, type Ref } from "vue";
import type { ExpenseRow } from "@/db/dexie";

export function useTripCharts(expenses: Ref<ExpenseRow[]>) {
  const chartByCategory = computed(() => {
    const map = new Map<string, number>();
    for (const e of expenses.value) {
      map.set(
        e.category || "Misc",
        (map.get(e.category || "Misc") ?? 0) + e.amountPaisa,
      );
    }
    const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
    return [...map.entries()]
      .map(([name, paisa]) => ({
        name,
        paisa,
        pct: Math.round((paisa / total) * 100),
      }))
      .sort((a, b) => b.paisa - a.paisa);
  });

  return { chartByCategory };
}
