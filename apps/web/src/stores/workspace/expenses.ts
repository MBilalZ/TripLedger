import { parseRupeesToPaisa } from "@tripledger/validation";
import { type ExpenseRow, type ExpenseSplitRow, newId } from "@/db/dexie";
import { type ExpenseInput, getWorkspaceRepo } from "@/repositories";
import type { CoreActions } from "./core";
import type { PoolActions } from "./pools";
import type { WorkspaceState } from "./state";

export function createExpenseActions(
  state: WorkspaceState,
  core: CoreActions,
  pools: PoolActions,
) {
  async function resolveExpensePoolId(poolId: string): Promise<string> {
    if (poolId && state.pools.value.some((p) => p.id === poolId)) return poolId;
    if (state.pools.value.length > 0) throw new Error("Select a pool");
    return pools.ensureDefaultPool();
  }

  function assertExpenseInput(input: ExpenseInput) {
    if (!input.description.trim()) throw new Error("Description is required");
    if (!input.paidById) throw new Error("Select who paid");
    if (!state.participants.value.some((p) => p.id === input.paidById)) {
      throw new Error("Select a valid payer");
    }
  }

  function buildExpenseRow(
    expenseId: string,
    poolId: string,
    input: ExpenseInput,
    amountPaisa: number,
  ): ExpenseRow {
    return {
      id: expenseId,
      tripId: state.tripId.value,
      poolId,
      description: input.description.trim(),
      category: input.category,
      amountPaisa,
      paidById: input.paidById,
      date: input.date,
      notes: input.notes,
      supersededById: null,
      createdAt: new Date().toISOString(),
      splitMode: input.splitMode,
    };
  }

  function buildSplits(expenseId: string, input: ExpenseInput): ExpenseSplitRow[] {
    if (!input.splitMode || !input.splits) return [];
    return input.splits.map((s) => ({
      id: newId("es"),
      tripId: state.tripId.value,
      expenseId,
      ...s,
    }));
  }

  async function addExpense(input: ExpenseInput) {
    assertExpenseInput(input);
    const poolId = await resolveExpensePoolId(input.poolId);
    const amountPaisa = parseRupeesToPaisa(input.amountRupees);
    const expenseId = newId("exp");
    const row = buildExpenseRow(expenseId, poolId, input, amountPaisa);
    const splits = buildSplits(expenseId, input);
    await getWorkspaceRepo().addExpense(state.tripId.value, row, splits);
    state.expenses.value = [...state.expenses.value, row];
    if (splits.length) {
      state.expenseSplits.value = [...state.expenseSplits.value, ...splits];
    }
    await core.touch();
    core.recomputeSettlement();
    state.announce("Expense added");
  }

  async function reviseExpense(expenseId: string, input: ExpenseInput) {
    const old = state.expenses.value.find((e) => e.id === expenseId);
    if (!old || old.supersededById) throw new Error("Expense not found");
    assertExpenseInput(input);
    const poolId = await resolveExpensePoolId(input.poolId);
    const amountPaisa = parseRupeesToPaisa(input.amountRupees);
    const newExpenseId = newId("exp");
    const row = buildExpenseRow(newExpenseId, poolId, input, amountPaisa);
    const splits = buildSplits(newExpenseId, input);
    await getWorkspaceRepo().reviseExpense(expenseId, row, splits);
    state.expenses.value = [
      ...state.expenses.value.filter((e) => e.id !== expenseId),
      row,
    ];
    state.expenseSplits.value = [
      ...state.expenseSplits.value.filter((s) => s.expenseId !== expenseId),
      ...splits,
    ];
    await core.touch();
    core.recomputeSettlement();
    state.announce("Expense updated");
  }

  async function removeExpense(expenseId: string) {
    const old = state.expenses.value.find((e) => e.id === expenseId);
    if (!old || old.supersededById || old.removed) return;
    await getWorkspaceRepo().removeExpense(expenseId, state.tripId.value);
    state.expenses.value = state.expenses.value.filter((e) => e.id !== expenseId);
    state.expenseSplits.value = state.expenseSplits.value.filter(
      (s) => s.expenseId !== expenseId,
    );
    await core.touch();
    core.recomputeSettlement();
    state.announce("Expense removed");
  }

  return { addExpense, reviseExpense, removeExpense };
}
