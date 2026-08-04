import { apiMutate } from "./client";

/** Expense/split writes go through security-definer RPCs (RLS is SELECT-only). */
export async function createExpenseWithSplits(
  expense: Record<string, unknown>,
  splits: Record<string, unknown>[],
): Promise<void> {
  await apiMutate((sb) =>
    sb.rpc("create_expense_with_splits", {
      p_expense: expense,
      p_splits: splits,
    }),
  );
}

export async function reviseExpenseWithSplits(
  oldExpenseId: string,
  expense: Record<string, unknown>,
  splits: Record<string, unknown>[],
): Promise<void> {
  await apiMutate((sb) =>
    sb.rpc("revise_expense_with_splits", {
      p_old_expense_id: oldExpenseId,
      p_expense: expense,
      p_splits: splits,
    }),
  );
}

export async function voidExpenseRpc(expenseId: string, tripId: string): Promise<void> {
  await apiMutate((sb) =>
    sb.rpc("void_expense", {
      p_expense_id: expenseId,
      p_trip_id: tripId,
    }),
  );
}
