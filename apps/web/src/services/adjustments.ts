import { apiMutate } from "./client";

export async function insertAdjustment(row: Record<string, unknown>): Promise<void> {
  await apiMutate((sb) => sb.from("adjustments").insert(row));
}

export async function updateAdjustment(
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await apiMutate((sb) => sb.from("adjustments").update(patch).eq("id", id));
}
