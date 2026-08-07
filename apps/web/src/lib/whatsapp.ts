import { settleTrip } from "@tripledger/engine";
import { db } from "@/db/dexie";
import { loadTripFacts } from "@/lib/tripFacts";
import {
  buildSettlementReport,
  buildSettlementReportText,
} from "@/lib/tripReport";

export async function copyWhatsAppSummary(
  tripName: string,
  _result: unknown,
  tripId?: string,
): Promise<void> {
  if (!tripId) throw new Error("Trip id is required for WhatsApp summary");
  const trip = await db.trips.get(tripId);
  if (!trip) throw new Error("Trip not found");
  const facts = await loadTripFacts(tripId);
  const settlement = settleTrip(facts);
  const report = buildSettlementReport({
    tripName: trip.name || tripName,
    currency: trip.currency,
    facts,
    settlement,
  });
  const text = buildSettlementReportText(report);
  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard is not available in this browser");
  }
  await navigator.clipboard.writeText(text);
}

/** Sync helper for tests. */
export function buildWhatsAppSummaryFromReport(
  report: ReturnType<typeof buildSettlementReport>,
): string {
  return buildSettlementReportText(report);
}
