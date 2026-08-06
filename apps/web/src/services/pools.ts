import { apiMutate } from "./client";

export async function insertPool(row: Record<string, unknown>): Promise<void> {
  await apiMutate((sb) => sb.from("pools").insert(row));
}

export async function updatePool(
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await apiMutate((sb) => sb.from("pools").update(patch).eq("id", id));
}

export async function deletePool(id: string): Promise<void> {
  await apiMutate((sb) => sb.from("pools").delete().eq("id", id));
}

export async function insertPoolMember(row: Record<string, unknown>): Promise<void> {
  await apiMutate((sb) => sb.from("pool_members").insert(row));
}

export async function updatePoolMember(
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await apiMutate((sb) => sb.from("pool_members").update(patch).eq("id", id));
}

export async function deletePoolMembersByPool(poolId: string): Promise<void> {
  await apiMutate((sb) => sb.from("pool_members").delete().eq("pool_id", poolId));
}
