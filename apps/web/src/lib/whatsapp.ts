import type { SettleTripResult } from "@tripledger/types";
import { db } from "@/db/dexie";
import { buildTripReport, buildTripReportText } from "@/lib/tripReport";

export function buildWhatsAppSummary(
  tripName: string,
  result: SettleTripResult,
  opts?: {
    currency?: string;
    expenses?: { category?: string; amountPaisa: number; poolId: string }[];
    pools?: { id: string; name: string }[];
  },
): string {
  const report = buildTripReport({
    tripName,
    currency: opts?.currency ?? "PKR",
    settlement: result,
    expenses: opts?.expenses ?? [],
    pools: opts?.pools ?? [],
  });
  return buildTripReportText(report);
}

export async function copyWhatsAppSummary(
  tripName: string,
  result: SettleTripResult,
  tripId?: string,
): Promise<void> {
  let currency = "PKR";
  let expenses: { category?: string; amountPaisa: number; poolId: string }[] = [];
  let pools: { id: string; name: string }[] = [];

  if (tripId) {
    const trip = await db.trips.get(tripId);
    currency = trip?.currency ?? "PKR";
    const [expenseRows, poolRows] = await Promise.all([
      db.expenses
        .where("tripId")
        .equals(tripId)
        .filter((e) => !e.supersededById)
        .toArray(),
      db.pools.where("tripId").equals(tripId).toArray(),
    ]);
    expenses = expenseRows;
    pools = poolRows;
  }

  const text = buildWhatsAppSummary(tripName, result, { currency, expenses, pools });
  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard is not available in this browser");
  }
  await navigator.clipboard.writeText(text);
}
