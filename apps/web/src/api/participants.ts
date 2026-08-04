import { apiMutate } from "./client";

export async function insertParticipant(
  row: Record<string, unknown>,
): Promise<void> {
  await apiMutate((sb) => sb.from("participants").insert(row));
}

export async function updateParticipant(
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await apiMutate((sb) => sb.from("participants").update(patch).eq("id", id));
}

export async function deleteParticipant(id: string): Promise<void> {
  await apiMutate((sb) => sb.from("participants").delete().eq("id", id));
}

export async function deletePoolMembersByParticipant(
  participantId: string,
): Promise<void> {
  await apiMutate((sb) =>
    sb.from("pool_members").delete().eq("participant_id", participantId),
  );
}

export async function deleteExpenseSplitsByParticipant(
  participantId: string,
): Promise<void> {
  await apiMutate((sb) =>
    sb.from("expense_splits").delete().eq("participant_id", participantId),
  );
}
