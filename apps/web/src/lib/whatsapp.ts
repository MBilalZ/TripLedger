import type { SettleTripResult, SettlementRounding } from "@tripledger/types";
import { formatPkr, paisaToRupees } from "@tripledger/engine";

function formatTransferAmount(
  amountPaisa: number,
  rounding: SettlementRounding,
): string {
  const rupees = paisaToRupees(amountPaisa);
  return rounding === "none"
    ? rupees.toLocaleString("en-PK", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : Math.round(rupees).toLocaleString("en-PK");
}

export function buildWhatsAppSummary(
  tripName: string,
  result: SettleTripResult,
  settlementRounding: SettlementRounding = "rupee",
): string {
  const lines: string[] = [
    `*TripLedger — ${tripName}*`,
    "",
    `Trip Total: ${formatPkr(result.summary.tripTotalPaisa, 0)}`,
    "",
    "*Paid*",
  ];

  for (const p of result.participants) {
    const adj =
      p.adjNetPaisa !== 0 ? ` · Adj ${formatPkr(p.adjNetPaisa)}` : "";
    lines.push(
      `${p.displayName}: Paid ${formatPkr(p.paidPaisa, 0)} · Share ${formatPkr(p.sharePaisa)}${adj}`,
    );
  }

  lines.push("", "*Final Settlement*");
  if (!result.consistency.ok) {
    lines.push("_Consistency error — do not settle until fixed._");
  } else if (result.settlements.length === 0) {
    lines.push("All settled — nothing to pay.");
  } else {
    for (const t of result.settlements) {
      lines.push(
        `${t.fromName} → ${t.toName}: Rs. ${formatTransferAmount(t.amountPaisa, settlementRounding)}`,
      );
    }
  }

  return lines.join("\n");
}

export async function copyWhatsAppSummary(
  tripName: string,
  result: SettleTripResult,
  settlementRounding: SettlementRounding = "rupee",
): Promise<void> {
  const text = buildWhatsAppSummary(tripName, result, settlementRounding);
  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard is not available in this browser");
  }
  await navigator.clipboard.writeText(text);
}
