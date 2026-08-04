import type {
  ConsistencyViolation,
  Expense,
  ParticipantMoney,
  PoolMember,
  PoolSummary,
  SettleTripResult,
  SplitLine,
  SplitMode,
  TripFacts,
} from "@tripledger/types";
import { DEFAULT_TRIP_SETTINGS } from "@tripledger/types";
import { allocateSplit } from "./allocation.js";
import { checkInvariants } from "./consistency.js";
import { assertIntegerPaisa } from "./money.js";
import { roundBalancesToRupees } from "./rounding.js";
import { buildTransfers } from "./settlement.js";

function asSplitLine(m: SplitLine): SplitLine {
  return {
    participantId: m.participantId,
    included: m.included,
    shares: m.shares,
    percentBps: m.percentBps,
    exactPaisa: m.exactPaisa,
  };
}

function resolveExpenseSplit(
  expense: Expense,
  facts: TripFacts,
): { mode: SplitMode; lines: SplitLine[]; error?: string } {
  const pool = facts.pools.find((p) => p.id === expense.poolId);
  if (!pool) {
    return { mode: "equal", lines: [], error: `Unknown pool ${expense.poolId}` };
  }

  if (expense.splitMode) {
    const lines = facts.expenseSplits
      .filter((s) => s.expenseId === expense.id)
      .map(asSplitLine);
    return { mode: expense.splitMode, lines };
  }

  const lines = facts.poolMembers
    .filter((m) => m.poolId === pool.id)
    .map(asSplitLine);
  return { mode: pool.splitMode, lines };
}

function validateSplitLines(
  label: string,
  mode: SplitMode,
  lines: SplitLine[],
  participantIds: Set<string>,
): ConsistencyViolation[] {
  const violations: ConsistencyViolation[] = [];
  for (const l of lines) {
    if (!participantIds.has(l.participantId)) {
      violations.push({
        id: "INPUT",
        message: `${label}: unknown participant ${l.participantId}`,
      });
    }
  }
  const included = lines.filter((l) => l.included);
  if (mode === "percent" && included.length > 0) {
    const sum = included.reduce((s, l) => s + l.percentBps, 0);
    if (sum !== 10_000) {
      violations.push({
        id: "INPUT",
        message: `${label}: percentages must sum to 100% (got ${sum / 100}%)`,
      });
    }
  }
  if (mode === "shares") {
    for (const l of included) {
      if (!Number.isInteger(l.shares) || l.shares < 1) {
        violations.push({
          id: "INPUT",
          message: `${label}: shares must be >= 1`,
        });
      }
    }
  }
  return violations;
}

function validateInput(facts: TripFacts): ConsistencyViolation[] {
  const violations: ConsistencyViolation[] = [];
  const participantIds = new Set(facts.participants.map((p) => p.id));
  const poolIds = new Set(facts.pools.map((p) => p.id));
  const expenseIds = new Set(
    facts.expenses.filter((e) => !e.supersededById).map((e) => e.id),
  );

  for (const p of facts.participants) {
    if (!p.displayName?.trim()) {
      violations.push({
        id: "INPUT",
        message: `Participant ${p.id} has empty displayName`,
      });
    }
  }

  for (const pool of facts.pools) {
    if (!["equal", "shares", "percent", "exact"].includes(pool.splitMode)) {
      violations.push({
        id: "INPUT",
        message: `Pool ${pool.name}: invalid splitMode`,
      });
    }
    const members = facts.poolMembers.filter((m) => m.poolId === pool.id);
    violations.push(
      ...validateSplitLines(`Pool ${pool.name}`, pool.splitMode, members, participantIds),
    );
  }

  for (const m of facts.poolMembers) {
    if (!poolIds.has(m.poolId)) {
      violations.push({
        id: "INPUT",
        message: `PoolMember references unknown pool ${m.poolId}`,
      });
    }
  }

  for (const e of facts.expenses) {
    if (e.supersededById) continue;
    try {
      assertIntegerPaisa(e.amountPaisa, `Expense ${e.id}`);
    } catch (err) {
      violations.push({
        id: "INPUT",
        message: err instanceof Error ? err.message : String(err),
      });
    }
    if (e.amountPaisa <= 0) {
      violations.push({
        id: "INPUT",
        message: `Expense ${e.id} amount must be > 0`,
      });
    }
    if (!poolIds.has(e.poolId)) {
      violations.push({
        id: "INPUT",
        message: `Expense ${e.id} references unknown pool ${e.poolId}`,
      });
    }
    if (!participantIds.has(e.paidById)) {
      violations.push({
        id: "INPUT",
        message: `Expense ${e.id} paidBy unknown participant`,
      });
    }
    if (e.splitMode) {
      const lines = facts.expenseSplits.filter((s) => s.expenseId === e.id);
      violations.push(
        ...validateSplitLines(
          `Expense ${e.description || e.id}`,
          e.splitMode,
          lines,
          participantIds,
        ),
      );
      const alloc = allocateSplit(e.amountPaisa, e.splitMode, lines);
      if (alloc.error) {
        violations.push({
          id: "INPUT",
          message: `Expense ${e.description || e.id}: ${alloc.error}`,
        });
      }
    }
  }

  void expenseIds;

  for (const a of facts.adjustments) {
    try {
      assertIntegerPaisa(a.amountPaisa, `Adjustment ${a.id}`);
    } catch (err) {
      violations.push({
        id: "INPUT",
        message: err instanceof Error ? err.message : String(err),
      });
    }
    if (a.amountPaisa <= 0) {
      violations.push({
        id: "INPUT",
        message: `Adjustment ${a.id} amount must be > 0`,
      });
    }
    if (a.fromId === a.toId) {
      violations.push({
        id: "INPUT",
        message: `Adjustment ${a.id} from and to must differ`,
      });
    }
    if (!participantIds.has(a.fromId) || !participantIds.has(a.toId)) {
      violations.push({
        id: "INPUT",
        message: `Adjustment ${a.id} references unknown participant`,
      });
    }
  }

  // Pool with expenses must have allocatable members (unless all expenses override)
  for (const pool of facts.pools) {
    const poolExpenses = facts.expenses.filter(
      (e) => e.poolId === pool.id && !e.supersededById && !e.splitMode,
    );
    if (poolExpenses.length === 0) continue;
    const members = facts.poolMembers.filter(
      (m) => m.poolId === pool.id && m.included,
    );
    if (members.length === 0) {
      violations.push({
        id: "INPUT",
        message: `Pool "${pool.name}" has expenses but no included participants`,
      });
    }
  }

  return violations;
}

function memberShareWeight(m: PoolMember, mode: SplitMode): number {
  if (!m.included) return 0;
  if (mode === "shares") return m.shares;
  if (mode === "equal") return 1;
  if (mode === "percent") return m.percentBps;
  return m.exactPaisa;
}

/**
 * Pure settlement: all totals/balances/transfers are derived from facts.
 */
export function settleTrip(raw: TripFacts): SettleTripResult {
  const facts: TripFacts = {
    ...raw,
    expenseSplits: raw.expenseSplits ?? [],
    settings: { ...DEFAULT_TRIP_SETTINGS, ...raw.settings },
    pools: raw.pools.map((p) => ({
      ...p,
      splitMode: p.splitMode ?? "shares",
    })),
  };
  const settings = facts.settings;
  const inputViolations = validateInput(facts);
  const nameById = new Map(
    facts.participants.map((p) => [p.id, p.displayName] as const),
  );

  const activeExpenses = facts.expenses.filter((e) => !e.supersededById);

  const paid = new Map<string, number>();
  const share = new Map<string, number>();
  const adjNet = new Map<string, number>();

  for (const p of facts.participants) {
    paid.set(p.id, 0);
    share.set(p.id, 0);
    adjNet.set(p.id, 0);
  }

  for (const e of activeExpenses) {
    paid.set(e.paidById, (paid.get(e.paidById) ?? 0) + e.amountPaisa);
  }

  // Pool-default expenses: allocate the pool total once (stable remainders).
  // Expenses with splitMode override: allocate each expense individually.
  const overridden = activeExpenses.filter((e) => e.splitMode);
  const poolDefault = activeExpenses.filter((e) => !e.splitMode);

  for (const pool of facts.pools) {
    const poolTotal = poolDefault
      .filter((e) => e.poolId === pool.id)
      .reduce((s, e) => s + e.amountPaisa, 0);
    if (poolTotal <= 0) continue;
    const lines = facts.poolMembers
      .filter((m) => m.poolId === pool.id)
      .map(asSplitLine);
    const alloc = allocateSplit(poolTotal, pool.splitMode, lines);
    if (alloc.error) {
      inputViolations.push({
        id: "INPUT",
        message: `Pool "${pool.name}": ${alloc.error}`,
      });
      continue;
    }
    for (const slice of alloc.slices) {
      share.set(
        slice.participantId,
        (share.get(slice.participantId) ?? 0) + slice.sharePaisa,
      );
    }
  }

  for (const e of overridden) {
    const resolved = resolveExpenseSplit(e, facts);
    if (resolved.error) {
      inputViolations.push({ id: "INPUT", message: resolved.error });
      continue;
    }
    const alloc = allocateSplit(e.amountPaisa, resolved.mode, resolved.lines);
    if (alloc.error) {
      inputViolations.push({
        id: "INPUT",
        message: `Expense "${e.description}": ${alloc.error}`,
      });
      continue;
    }
    for (const slice of alloc.slices) {
      share.set(
        slice.participantId,
        (share.get(slice.participantId) ?? 0) + slice.sharePaisa,
      );
    }
  }

  const poolSummaries: PoolSummary[] = [];
  let poolTotalsSum = 0;

  for (const pool of facts.pools) {
    const totalPaisa = activeExpenses
      .filter((e) => e.poolId === pool.id)
      .reduce((s, e) => s + e.amountPaisa, 0);
    poolTotalsSum += totalPaisa;

    const members = facts.poolMembers.filter((m) => m.poolId === pool.id);
    const headCount = members.reduce(
      (s, m) => s + memberShareWeight(m, pool.splitMode),
      0,
    );

    poolSummaries.push({
      poolId: pool.id,
      name: pool.name,
      splitMode: pool.splitMode,
      totalPaisa,
      headCount,
      costPerHeadPaisa:
        pool.splitMode === "shares" && headCount > 0
          ? Math.floor(totalPaisa / headCount)
          : 0,
    });
  }

  for (const a of facts.adjustments) {
    adjNet.set(a.fromId, (adjNet.get(a.fromId) ?? 0) - a.amountPaisa);
    adjNet.set(a.toId, (adjNet.get(a.toId) ?? 0) + a.amountPaisa);
  }

  const tripTotalPaisa = activeExpenses.reduce((s, e) => s + e.amountPaisa, 0);

  const exactParticipants = facts.participants.map((p) => {
    const paidPaisa = paid.get(p.id) ?? 0;
    const sharePaisa = share.get(p.id) ?? 0;
    const adjNetPaisa = adjNet.get(p.id) ?? 0;
    return {
      participantId: p.id,
      displayName: p.displayName,
      paidPaisa,
      sharePaisa,
      adjNetPaisa,
      balancePaisa: paidPaisa - sharePaisa + adjNetPaisa,
    };
  });

  const useRounding = settings.settlementRounding === "rupee";
  const rounded = useRounding
    ? roundBalancesToRupees(
        exactParticipants.map((p) => ({
          participantId: p.participantId,
          balancePaisa: p.balancePaisa,
        })),
      )
    : exactParticipants.map((p) => ({
        participantId: p.participantId,
        exactPaisa: p.balancePaisa,
        roundedPaisa: p.balancePaisa,
      }));
  const roundedById = new Map(rounded.map((r) => [r.participantId, r]));

  const participants: ParticipantMoney[] = exactParticipants.map((p) => ({
    ...p,
    balanceRupeesPaisa: roundedById.get(p.participantId)?.roundedPaisa ?? 0,
  }));

  const settlements = buildTransfers(
    participants.map((p) => ({
      participantId: p.participantId,
      displayName: p.displayName,
      balancePaisa: p.balanceRupeesPaisa,
    })),
    settings.transferMode,
    settings.settlementHubId,
  );

  for (const t of settlements) {
    t.fromName = nameById.get(t.fromId) ?? t.fromName;
    t.toName = nameById.get(t.toId) ?? t.toName;
  }

  const paidSum = participants.reduce((s, p) => s + p.paidPaisa, 0);
  const shareSum = participants.reduce((s, p) => s + p.sharePaisa, 0);
  const adjNetSum = participants.reduce((s, p) => s + p.adjNetPaisa, 0);

  // Deduplicate INPUT violations that might appear twice
  const uniqueInput = inputViolations.filter(
    (v, i, arr) =>
      arr.findIndex((x) => x.id === v.id && x.message === v.message) === i,
  );

  const consistency = checkInvariants({
    tripTotalPaisa,
    poolTotalsSumPaisa: poolTotalsSum,
    paidSumPaisa: paidSum,
    shareSumPaisa: shareSum,
    adjNetSumPaisa: adjNetSum,
    participants,
    settlements,
    inputViolations: uniqueInput,
  });

  return {
    summary: {
      tripTotalPaisa,
      participantCount: facts.participants.length,
      poolCount: facts.pools.length,
      expenseCount: activeExpenses.length,
      adjustmentCount: facts.adjustments.length,
      transferMode: settings.transferMode,
      settlementRounding: settings.settlementRounding,
    },
    pools: poolSummaries,
    participants,
    settlements,
    consistency,
  };
}
