import type { SettleTripResult } from "@tripledger/types";
import { formatPkr, paisaToRupees } from "@tripledger/engine";

export function buildWhatsAppSummary(
  tripName: string,
  result: SettleTripResult,
): string {
  const lines: string[] = [
    `*TripLedger — ${tripName}*`,
    "",
    `Trip Total: ${formatPkr(result.summary.tripTotalPaisa, 0)}`,
    "",
    "*Paid*",
  ];

  for (const p of result.participants) {
    lines.push(`${p.displayName}: ${formatPkr(p.paidPaisa, 0)}`);
  }

  lines.push("", "*Final Settlement*");
  if (!result.consistency.ok) {
    lines.push("_Consistency error — do not settle until fixed._");
  } else if (result.settlements.length === 0) {
    lines.push("All settled — nothing to pay.");
  } else {
    for (const t of result.settlements) {
      lines.push(
        `${t.fromName} → ${t.toName}: Rs. ${Math.round(paisaToRupees(t.amountPaisa)).toLocaleString("en-PK")}`,
      );
    }
  }

  return lines.join("\n");
}

export async function copyWhatsAppSummary(
  tripName: string,
  result: SettleTripResult,
): Promise<void> {
  const text = buildWhatsAppSummary(tripName, result);
  await navigator.clipboard.writeText(text);
}
