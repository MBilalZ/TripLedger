import { formatPkr } from "@tripledger/engine";
import type { SettleTripResult } from "@tripledger/types";

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
    const adj = p.adjNetPaisa !== 0 ? ` · Adj ${formatPkr(p.adjNetPaisa)}` : "";
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
      lines.push(`${t.fromName} → ${t.toName}: ${formatPkr(t.amountPaisa)}`);
    }
  }

  return lines.join("\n");
}

export async function copyWhatsAppSummary(
  tripName: string,
  result: SettleTripResult,
): Promise<void> {
  const text = buildWhatsAppSummary(tripName, result);
  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard is not available in this browser");
  }
  await navigator.clipboard.writeText(text);
}
