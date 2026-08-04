import { apiMutate } from "./client";

export async function insertExpense(
  row: Record<string, unknown>,
): Promise<void> {
  await apiMutate((sb) => sb.from("expenses").insert(row));
}

export async function updateExpense(
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await apiMutate((sb) => sb.from("expenses").update(patch).eq("id", id));
}

export async function insertExpenseSplit(
  row: Record<string, unknown>,
): Promise<void> {
  await apiMutate((sb) => sb.from("expense_splits").insert(row));
}

export async function deleteExpenseSplitsByExpense(
  expenseId: string,
): Promise<void> {
  await apiMutate((sb) =>
    sb.from("expense_splits").delete().eq("expense_id", expenseId),
  );
}

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

export async function voidExpenseRpc(
  expenseId: string,
  tripId: string,
): Promise<void> {
  await apiMutate((sb) =>
    sb.rpc("void_expense", {
      p_expense_id: expenseId,
      p_trip_id: tripId,
    }),
  );
}
