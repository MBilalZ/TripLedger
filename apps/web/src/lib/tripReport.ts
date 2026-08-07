import { formatPkr, paisaToRupees } from "@tripledger/engine";
import type { ParticipantMoney, SettleTripResult, Transfer } from "@tripledger/types";

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

export type TripReportParticipant = {
  participantId: string;
  displayName: string;
  paidPaisa: number;
  sharePaisa: number;
  adjNetPaisa: number;
  balancePaisa: number;
  /** Subline matching Balances UI (without trailing balance). */
  detailLine: string;
  paidLabel: string;
  shareLabel: string;
  adjLabel: string | null;
  balanceLabel: string;
};

export type TripReportTransfer = {
  fromName: string;
  toName: string;
  amountPaisa: number;
  amountLabel: string;
  amountRupees: number;
};

export type TripReport = {
  tripName: string;
  currency: string;
  tripTotalPaisa: number;
  tripTotalLabel: string;
  balanced: boolean;
  balancedLabel: string;
  memberCount: number;
  memberLabel: string;
  participants: TripReportParticipant[];
  transfers: TripReportTransfer[];
  charts: TripReportCharts;
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

function sortParticipants(list: ParticipantMoney[]): ParticipantMoney[] {
  return [...list].sort((a, b) => {
    const byName = a.displayName.localeCompare(b.displayName, undefined, {
      sensitivity: "base",
    });
    if (byName !== 0) return byName;
    return a.participantId.localeCompare(b.participantId);
  });
}

function mapParticipant(p: ParticipantMoney): TripReportParticipant {
  const paidLabel = formatPkr(p.paidPaisa, 0);
  const shareLabel = formatPkr(p.sharePaisa);
  const adjLabel = p.adjNetPaisa ? formatPkr(p.adjNetPaisa) : null;
  const balanceLabel = formatPkr(p.balancePaisa);
  const detailParts = [`Paid ${paidLabel}`, `Share ${shareLabel}`];
  if (adjLabel) detailParts.push(`Adj ${adjLabel}`);
  return {
    participantId: p.participantId,
    displayName: p.displayName,
    paidPaisa: p.paidPaisa,
    sharePaisa: p.sharePaisa,
    adjNetPaisa: p.adjNetPaisa,
    balancePaisa: p.balancePaisa,
    detailLine: detailParts.join(" · "),
    paidLabel,
    shareLabel,
    adjLabel,
    balanceLabel,
  };
}

function mapTransfer(t: Transfer): TripReportTransfer {
  return {
    fromName: t.fromName,
    toName: t.toName,
    amountPaisa: t.amountPaisa,
    amountLabel: formatPkr(t.amountPaisa),
    amountRupees: t.amountRupees,
  };
}

export function buildTripReport(opts: {
  tripName: string;
  currency: string;
  settlement: SettleTripResult;
  expenses: ExpenseForCharts[];
  pools: PoolForCharts[];
}): TripReport {
  const { tripName, currency, settlement, expenses, pools } = opts;
  const memberCount = settlement.summary.participantCount;
  return {
    tripName,
    currency,
    tripTotalPaisa: settlement.summary.tripTotalPaisa,
    tripTotalLabel: formatPkr(settlement.summary.tripTotalPaisa, 0),
    balanced: settlement.consistency.ok,
    balancedLabel: settlement.consistency.ok ? "Balanced" : "Consistency error",
    memberCount,
    memberLabel: `${memberCount} ${memberCount === 1 ? "person" : "people"}`,
    participants: sortParticipants(settlement.participants).map(mapParticipant),
    transfers: settlement.settlements.map(mapTransfer),
    charts: buildTripReportCharts(expenses, pools, settlement),
  };
}

function formatChartSection(title: string, slices: ChartSlice[]): string[] {
  const lines = [`*${title}*`];
  if (slices.length === 0) {
    lines.push("_None_");
    return lines;
  }
  for (const s of slices) {
    lines.push(`${s.name}: ${formatPkr(s.paisa, 0)} · ${s.pct}%`);
  }
  return lines;
}

/** Plain-text report for WhatsApp / clipboard, mirroring Balances + Settle. */
export function buildTripReportText(report: TripReport): string {
  const lines: string[] = [
    `*TripLedger — ${report.tripName}*`,
    `Total ${report.tripTotalLabel} · ${report.currency}`,
    report.balancedLabel,
    report.memberLabel,
    "",
    "*Per friend*",
  ];

  if (report.participants.length === 0) {
    lines.push("Add friends to see balances.");
  } else {
    for (const p of report.participants) {
      lines.push(`${p.displayName}: ${p.detailLine} · Bal ${p.balanceLabel}`);
    }
  }

  lines.push("", "*Suggested transfers*");
  if (report.transfers.length === 0) {
    lines.push("No transfers needed — everyone is settled.");
  } else {
    for (const t of report.transfers) {
      lines.push(`${t.fromName} pays ${t.toName}: ${t.amountLabel}`);
    }
  }

  lines.push("", "*Charts*");
  lines.push(...formatChartSection("By pool", report.charts.byPool));
  lines.push("");
  lines.push(...formatChartSection("By category", report.charts.byCategory));
  lines.push("");
  lines.push(...formatChartSection("Paid by person", report.charts.byPersonPaid));
  lines.push("");
  lines.push(...formatChartSection("Share by person", report.charts.byPersonShare));

  return lines.join("\n");
}

/** Numeric rupees for Excel cells (same precision as Balances display). */
export function reportAmountRupees(paisa: number, decimals = 2): number {
  const rupees = paisaToRupees(paisa);
  const factor = 10 ** decimals;
  return Math.round(rupees * factor) / factor;
}
