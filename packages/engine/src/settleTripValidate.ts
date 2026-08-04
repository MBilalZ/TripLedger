import type {
  ConsistencyViolation,
  Expense,
  SplitLine,
  SplitMode,
  TripFacts,
} from "@tripledger/types";
import { allocateSplit } from "./allocation.js";
import { assertIntegerPaisa } from "./money.js";

export function asSplitLine(m: SplitLine): SplitLine {
  return {
    participantId: m.participantId,
    included: m.included,
    shares: m.shares,
    percentBps: m.percentBps,
    exactPaisa: m.exactPaisa,
  };
}

export function resolveExpenseSplit(
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

  const lines = facts.poolMembers.filter((m) => m.poolId === pool.id).map(asSplitLine);
  return { mode: pool.splitMode, lines };
}

export function validateSplitLines(
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

export function validateInput(facts: TripFacts): ConsistencyViolation[] {
  const violations: ConsistencyViolation[] = [];
  const participantIds = new Set(facts.participants.map((p) => p.id));
  const poolIds = new Set(facts.pools.map((p) => p.id));

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

  for (const pool of facts.pools) {
    const poolExpenses = facts.expenses.filter(
      (e) => e.poolId === pool.id && !e.supersededById && !e.splitMode,
    );
    if (poolExpenses.length === 0) continue;
    const members = facts.poolMembers.filter((m) => m.poolId === pool.id && m.included);
    if (members.length === 0) {
      violations.push({
        id: "INPUT",
        message: `Pool "${pool.name}" has expenses but no included participants`,
      });
    }
  }

  return violations;
}
