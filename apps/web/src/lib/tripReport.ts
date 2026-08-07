import { allocateSplit, formatPkr, paisaToRupees } from "@tripledger/engine";
import type {
  SettleTripResult,
  SplitLine,
  SplitMode,
  TripFacts,
} from "@tripledger/types";

export type SettlementReportExpense = {
  date: string;
  description: string;
  category: string;
  poolName: string;
  payerName: string;
  amountPaisa: number;
  amountLabel: string;
};

export type SettlementReportPayment = {
  participantId: string;
  displayName: string;
  paidPaisa: number;
  paidLabel: string;
};

export type SettlementReportPoolMember = {
  participantId: string;
  displayName: string;
  weight: number;
  weightLabel: string;
  sharePaisa: number;
  shareLabel: string;
};

export type SettlementReportPoolPart = {
  poolId: string;
  name: string;
  splitMode: SplitMode;
  totalPaisa: number;
  totalLabel: string;
  totalWeight: number;
  weightColumn: string;
  sharedAmongLabel: string;
  costPerUnitLabel: string | null;
  members: SettlementReportPoolMember[];
};

export type SettlementReportMatrixCell = {
  poolId: string;
  poolName: string;
  sharePaisa: number;
  shareLabel: string;
};

export type SettlementReportMatrixRow = {
  participantId: string;
  displayName: string;
  cells: SettlementReportMatrixCell[];
  totalSharePaisa: number;
  totalShareLabel: string;
};

export type SettlementReportCompareRow = {
  participantId: string;
  displayName: string;
  paidPaisa: number;
  shouldPayPaisa: number;
  differencePaisa: number;
  paidLabel: string;
  shouldPayLabel: string;
  differenceLabel: string;
};

export type SettlementReportAdjustment = {
  fromName: string;
  toName: string;
  amountPaisa: number;
  amountLabel: string;
  reason: string;
};

export type SettlementReportTransfer = {
  fromName: string;
  toName: string;
  amountPaisa: number;
  amountLabel: string;
  roundedRupees: number;
  roundedLabel: string;
};

export type SettlementReport = {
  tripName: string;
  currency: string;
  tripTotalPaisa: number;
  tripTotalLabel: string;
  balanced: boolean;
  balancedLabel: string;
  expenses: SettlementReportExpense[];
  payments: SettlementReportPayment[];
  paymentsTotalPaisa: number;
  paymentsTotalLabel: string;
  pools: SettlementReportPoolPart[];
  poolNames: string[];
  matrix: SettlementReportMatrixRow[];
  compare: SettlementReportCompareRow[];
  differenceChecksumOk: boolean;
  differenceChecksumLabel: string;
  adjustments: SettlementReportAdjustment[];
  transfers: SettlementReportTransfer[];
};

/** Numeric rupees for Excel cells. */
export function reportAmountRupees(paisa: number, decimals = 2): number {
  const rupees = paisaToRupees(paisa);
  const factor = 10 ** decimals;
  return Math.round(rupees * factor) / factor;
}

function asSplitLine(m: SplitLine): SplitLine {
  return {
    participantId: m.participantId,
    included: m.included,
    shares: m.shares,
    percentBps: m.percentBps,
    exactPaisa: m.exactPaisa,
  };
}

function memberWeight(mode: SplitMode, line: SplitLine): number {
  if (!line.included) return 0;
  if (mode === "shares") return line.shares;
  if (mode === "equal") return 1;
  if (mode === "percent") return line.percentBps;
  return line.exactPaisa;
}

function weightColumnLabel(mode: SplitMode): string {
  if (mode === "shares") return "People";
  if (mode === "equal") return "Included";
  if (mode === "percent") return "Percent";
  return "Exact Rs";
}

function formatWeight(mode: SplitMode, weight: number): string {
  if (mode === "percent") return `${(weight / 100).toFixed(2)}%`;
  if (mode === "exact") return formatPkr(weight, 2);
  return String(weight);
}

function formatSignedDiff(paisa: number): string {
  const abs = formatPkr(Math.abs(paisa));
  if (paisa > 0) return `+${abs}`;
  if (paisa < 0) return `−${abs}`;
  return abs;
}

/**
 * Per-pool share matrix mirroring settleTrip allocation
 * (pool-default batch + per-expense overrides).
 */
export function buildPoolShareMatrix(facts: TripFacts): Map<string, Map<string, number>> {
  const matrix = new Map<string, Map<string, number>>();
  const ensure = (poolId: string, participantId: string) => {
    let row = matrix.get(poolId);
    if (!row) {
      row = new Map();
      matrix.set(poolId, row);
    }
    if (!row.has(participantId)) row.set(participantId, 0);
    return row;
  };

  const active = facts.expenses.filter((e) => !e.supersededById);
  const poolDefault = active.filter((e) => !e.splitMode);
  const overridden = active.filter((e) => e.splitMode);

  for (const pool of facts.pools) {
    const poolTotal = poolDefault
      .filter((e) => e.poolId === pool.id)
      .reduce((s, e) => s + e.amountPaisa, 0);
    if (poolTotal <= 0) continue;
    const lines = facts.poolMembers.filter((m) => m.poolId === pool.id).map(asSplitLine);
    const alloc = allocateSplit(poolTotal, pool.splitMode, lines);
    if (alloc.error) continue;
    for (const slice of alloc.slices) {
      const row = ensure(pool.id, slice.participantId);
      row.set(
        slice.participantId,
        (row.get(slice.participantId) ?? 0) + slice.sharePaisa,
      );
    }
  }

  for (const e of overridden) {
    const pool = facts.pools.find((p) => p.id === e.poolId);
    if (!pool || !e.splitMode) continue;
    const lines = facts.expenseSplits
      .filter((s) => s.expenseId === e.id)
      .map(asSplitLine);
    const alloc = allocateSplit(e.amountPaisa, e.splitMode, lines);
    if (alloc.error) continue;
    for (const slice of alloc.slices) {
      const row = ensure(e.poolId, slice.participantId);
      row.set(
        slice.participantId,
        (row.get(slice.participantId) ?? 0) + slice.sharePaisa,
      );
    }
  }

  return matrix;
}

function sortByName<T extends { displayName: string; participantId?: string }>(
  list: T[],
): T[] {
  return [...list].sort((a, b) => {
    const byName = a.displayName.localeCompare(b.displayName, undefined, {
      sensitivity: "base",
    });
    if (byName !== 0) return byName;
    return (a.participantId ?? "").localeCompare(b.participantId ?? "");
  });
}

export function buildSettlementReport(opts: {
  tripName: string;
  currency: string;
  facts: TripFacts;
  settlement: SettleTripResult;
}): SettlementReport {
  const { tripName, currency, facts, settlement } = opts;
  const nameById = new Map(facts.participants.map((p) => [p.id, p.displayName]));
  const poolNameById = new Map(facts.pools.map((p) => [p.id, p.name]));
  const matrix = buildPoolShareMatrix(facts);
  const activeExpenses = facts.expenses.filter((e) => !e.supersededById);

  const expenses: SettlementReportExpense[] = [...activeExpenses]
    .sort(
      (a, b) =>
        (a.date ?? "").localeCompare(b.date ?? "") ||
        a.description.localeCompare(b.description),
    )
    .map((e) => ({
      date: e.date ?? "",
      description: e.description,
      category: e.category ?? "",
      poolName: poolNameById.get(e.poolId) ?? e.poolId,
      payerName: nameById.get(e.paidById) ?? e.paidById,
      amountPaisa: e.amountPaisa,
      amountLabel: formatPkr(e.amountPaisa, 0),
    }));

  const payments = sortByName(
    settlement.participants
      .filter((p) => p.paidPaisa > 0)
      .map((p) => ({
        participantId: p.participantId,
        displayName: p.displayName,
        paidPaisa: p.paidPaisa,
        paidLabel: formatPkr(p.paidPaisa, 0),
      })),
  );
  // Include zero-paid people who appear in settlement for completeness in payments table?
  // Sample shows only people who paid. Keep paid > 0; total from trip total.
  const paymentsTotalPaisa = settlement.summary.tripTotalPaisa;

  const pools: SettlementReportPoolPart[] = facts.pools
    .map((pool) => {
      const totalPaisa = activeExpenses
        .filter((e) => e.poolId === pool.id)
        .reduce((s, e) => s + e.amountPaisa, 0);
      const members = facts.poolMembers.filter((m) => m.poolId === pool.id);
      const weights = new Map(
        members.map((m) => [m.participantId, memberWeight(pool.splitMode, m)] as const),
      );
      const totalWeight = [...weights.values()].reduce((a, b) => a + b, 0);
      const poolShares = matrix.get(pool.id) ?? new Map<string, number>();

      const partMembers: SettlementReportPoolMember[] = [];
      for (const p of facts.participants) {
        const weight = weights.get(p.id) ?? 0;
        const sharePaisa = poolShares.get(p.id) ?? 0;
        if (weight <= 0 && sharePaisa <= 0) continue;
        partMembers.push({
          participantId: p.id,
          displayName: p.displayName,
          weight,
          weightLabel: formatWeight(pool.splitMode, weight),
          sharePaisa,
          shareLabel: formatPkr(sharePaisa),
        });
      }
      sortByName(partMembers);

      let costPerUnitLabel: string | null = null;
      if (pool.splitMode === "shares" && totalWeight > 0 && totalPaisa > 0) {
        const perHead = paisaToRupees(totalPaisa) / totalWeight;
        costPerUnitLabel = `Rs. ${perHead.toLocaleString("en-PK", {
          minimumFractionDigits: 4,
          maximumFractionDigits: 4,
        })}`;
      }

      const weightNoun =
        pool.splitMode === "shares"
          ? "people"
          : pool.splitMode === "equal"
            ? "people"
            : pool.splitMode === "percent"
              ? "percent weight"
              : "exact total";

      return {
        poolId: pool.id,
        name: pool.name,
        splitMode: pool.splitMode,
        totalPaisa,
        totalLabel: formatPkr(totalPaisa, 0),
        totalWeight,
        weightColumn: weightColumnLabel(pool.splitMode),
        sharedAmongLabel:
          pool.splitMode === "shares" || pool.splitMode === "equal"
            ? `Shared among ${totalWeight} ${weightNoun}`
            : `Split mode: ${pool.splitMode} (total weight ${totalWeight})`,
        costPerUnitLabel,
        members: partMembers,
      };
    })
    .filter((p) => p.totalPaisa > 0 || p.members.length > 0);

  const poolNames = pools.map((p) => p.name);

  const matrixRows: SettlementReportMatrixRow[] = sortByName(
    facts.participants.map((p) => {
      const cells = pools.map((pool) => {
        const sharePaisa = matrix.get(pool.poolId)?.get(p.id) ?? 0;
        return {
          poolId: pool.poolId,
          poolName: pool.name,
          sharePaisa,
          shareLabel: sharePaisa === 0 ? "—" : formatPkr(sharePaisa),
        };
      });
      const totalSharePaisa = cells.reduce((s, c) => s + c.sharePaisa, 0);
      return {
        participantId: p.id,
        displayName: p.displayName,
        cells,
        totalSharePaisa,
        totalShareLabel: formatPkr(totalSharePaisa),
      };
    }),
  ).filter(
    (r) =>
      r.totalSharePaisa > 0 ||
      settlement.participants.some(
        (p) =>
          p.participantId === r.participantId && (p.paidPaisa > 0 || p.adjNetPaisa !== 0),
      ),
  );

  // Prefer showing all participants who have any money activity
  const compareParticipants = sortByName(
    settlement.participants.filter(
      (p) => p.paidPaisa !== 0 || p.sharePaisa !== 0 || p.adjNetPaisa !== 0,
    ),
  );

  const compare: SettlementReportCompareRow[] = compareParticipants.map((p) => {
    const differencePaisa = p.paidPaisa - p.sharePaisa;
    return {
      participantId: p.participantId,
      displayName: p.displayName,
      paidPaisa: p.paidPaisa,
      shouldPayPaisa: p.sharePaisa,
      differencePaisa,
      paidLabel: formatPkr(p.paidPaisa),
      shouldPayLabel: formatPkr(p.sharePaisa),
      differenceLabel: formatSignedDiff(differencePaisa),
    };
  });

  const positiveDiff = compare
    .filter((c) => c.differencePaisa > 0)
    .reduce((s, c) => s + c.differencePaisa, 0);
  const negativeDiffAbs = compare
    .filter((c) => c.differencePaisa < 0)
    .reduce((s, c) => s + Math.abs(c.differencePaisa), 0);
  const differenceChecksumOk = positiveDiff === negativeDiffAbs;
  const differenceChecksumLabel = differenceChecksumOk
    ? `${formatPkr(negativeDiffAbs)} balances ${formatPkr(positiveDiff)} ✓`
    : `${formatPkr(negativeDiffAbs)} vs ${formatPkr(positiveDiff)}`;

  const adjustments: SettlementReportAdjustment[] = facts.adjustments.map((a) => ({
    fromName: nameById.get(a.fromId) ?? a.fromId,
    toName: nameById.get(a.toId) ?? a.toId,
    amountPaisa: a.amountPaisa,
    amountLabel: formatPkr(a.amountPaisa),
    reason: a.reason?.trim() || "Adjustment",
  }));

  const transfers: SettlementReportTransfer[] = settlement.settlements.map((t) => {
    const roundedRupees = Math.round(paisaToRupees(t.amountPaisa));
    return {
      fromName: t.fromName,
      toName: t.toName,
      amountPaisa: t.amountPaisa,
      amountLabel: formatPkr(t.amountPaisa),
      roundedRupees,
      roundedLabel: `Rs. ${roundedRupees.toLocaleString("en-PK")}`,
    };
  });

  return {
    tripName,
    currency,
    tripTotalPaisa: settlement.summary.tripTotalPaisa,
    tripTotalLabel: formatPkr(settlement.summary.tripTotalPaisa, 0),
    balanced: settlement.consistency.ok,
    balancedLabel: settlement.consistency.ok ? "Balanced" : "Consistency error",
    expenses,
    payments,
    paymentsTotalPaisa,
    paymentsTotalLabel: formatPkr(paymentsTotalPaisa, 0),
    pools,
    poolNames,
    matrix: matrixRows,
    compare,
    differenceChecksumOk,
    differenceChecksumLabel,
    adjustments,
    transfers,
  };
}

/** WhatsApp / clipboard narrative matching Expense Settlement Summary style. */
export function buildSettlementReportText(report: SettlementReport): string {
  const lines: string[] = [
    "*Expense Settlement Summary*",
    "",
    `*Trip:* ${report.tripName}`,
    `*Total Trip Expense:* ${report.tripTotalLabel}`,
    report.balancedLabel,
    "",
  ];

  if (report.expenses.length > 0) {
    lines.push("*Expense List*");
    for (const e of report.expenses) {
      const meta = [e.poolName, e.payerName, e.category].filter(Boolean).join(" · ");
      lines.push(`• ${e.description}: ${e.amountLabel}${meta ? ` (${meta})` : ""}`);
    }
    lines.push("");
  }

  lines.push("*1. Trip Expenses*");
  if (report.pools.length > 0) {
    lines.push("The expenses were divided into parts:");
    for (const pool of report.pools) {
      lines.push("");
      lines.push(`*${pool.name}:* ${pool.totalLabel} (${pool.sharedAmongLabel})`);
      for (const m of pool.members) {
        if (pool.splitMode === "shares" || pool.splitMode === "equal") {
          lines.push(
            `* ${m.displayName}: ${m.weightLabel} ${pool.splitMode === "shares" ? "people" : "included"}`,
          );
        } else {
          lines.push(`* ${m.displayName}: ${m.weightLabel}`);
        }
      }
      if (pool.costPerUnitLabel) {
        lines.push(
          `Cost per person: ${pool.totalLabel.replace("Rs. ", "")} ÷ ${pool.totalWeight} = *${pool.costPerUnitLabel}*`,
        );
      }
      lines.push("*Shares*");
      for (const m of pool.members) {
        lines.push(`* ${m.displayName}: ${m.shareLabel}`);
      }
    }
  }

  lines.push("");
  lines.push("*Actual Payments*");
  for (const p of report.payments) {
    lines.push(`* ${p.displayName}: ${p.paidLabel}`);
  }
  if (report.payments.length === 0) {
    lines.push("_No payments recorded._");
  } else {
    lines.push(`*Total:* ${report.paymentsTotalLabel}`);
  }

  lines.push("");
  lines.push("*Expected Share*");
  for (const row of report.matrix) {
    lines.push(`* ${row.displayName}: ${row.totalShareLabel}`);
  }

  lines.push("");
  lines.push("*Trip Settlement*");
  const owes = report.compare.filter((c) => c.differencePaisa < 0);
  const owed = report.compare.filter((c) => c.differencePaisa > 0);
  if (owes.length === 0 && owed.length === 0) {
    lines.push("Everyone's payments match their share.");
  } else if (owed.length === 1) {
    const creditor = owed[0]!;
    for (const c of owes) {
      lines.push(
        `* ${c.displayName} owes ${creditor.displayName}: *${formatPkr(Math.abs(c.differencePaisa))}*`,
      );
    }
  } else {
    for (const c of report.compare) {
      if (c.differencePaisa === 0) continue;
      lines.push(`* ${c.displayName}: ${c.differenceLabel}`);
    }
  }
  lines.push(`Check: ${report.differenceChecksumLabel}`);

  if (report.adjustments.length > 0) {
    lines.push("");
    lines.push("*2. Adjustments*");
    for (const a of report.adjustments) {
      lines.push(`* ${a.reason}`);
      lines.push(`  ${a.fromName} → ${a.toName}: *${a.amountLabel}*`);
    }
  }

  lines.push("");
  lines.push("*Final Settlement*");
  if (report.transfers.length === 0) {
    lines.push("No transfers needed — everyone is settled.");
  } else {
    for (const t of report.transfers) {
      lines.push(`* *${t.fromName} → ${t.toName}: ${t.amountLabel}*`);
    }
    lines.push("");
    lines.push("*Rounded to the nearest rupee:*");
    for (const t of report.transfers) {
      lines.push(`* ${t.fromName} pays ${t.toName}: *${t.roundedLabel}*`);
    }
  }

  return lines.join("\n");
}
