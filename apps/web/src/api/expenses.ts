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
