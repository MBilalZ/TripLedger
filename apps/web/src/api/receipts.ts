import { newId } from "@/db/dexie";
import { apiCall, apiMutate } from "./client";
import { getSupabase, requireUser } from "./supabase";
import { toApiError } from "./errors";

export type ExpenseReceiptMeta = {
  id: string;
  tripId: string;
  expenseId: string;
  storagePath: string;
  contentType: string;
  byteSize: number;
  createdAt: string;
};

const BUCKET = "receipts";
const MAX_BYTES = 5 * 1024 * 1024;

export async function listReceipts(
  tripId: string,
  expenseId?: string,
): Promise<ExpenseReceiptMeta[]> {
  return apiCall(async (sb) => {
    let q = sb
      .from("expense_receipts")
      .select("*")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false });
    if (expenseId) q = q.eq("expense_id", expenseId);
    const res = await q;
    const mapped = (res.data ?? []).map((r) => ({
      id: r.id as string,
      tripId: r.trip_id as string,
      expenseId: r.expense_id as string,
      storagePath: r.storage_path as string,
      contentType: r.content_type as string,
      byteSize: r.byte_size as number,
      createdAt: r.created_at as string,
    }));
    if (res.error) return { data: [] as ExpenseReceiptMeta[], error: res.error };
    return { data: mapped, error: null };
  });
}

export async function uploadReceipt(
  tripId: string,
  expenseId: string,
  file: File,
): Promise<ExpenseReceiptMeta> {
  if (file.size > MAX_BYTES) {
    throw new Error("Receipt must be 5MB or smaller");
  }
  const uid = await requireUser();
  const id = newId("rcpt");
  const ext = file.name.split(".").pop()?.slice(0, 8) || "bin";
  const path = `${tripId}/${expenseId}/${id}.${ext}`;
  const sb = getSupabase();

  const up = await sb.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (up.error) throw toApiError(up.error);

  await apiMutate((client) =>
    client.from("expense_receipts").insert({
      id,
      trip_id: tripId,
      expense_id: expenseId,
      storage_path: path,
      content_type: file.type || "application/octet-stream",
      byte_size: file.size,
      created_by: uid,
    }),
  );

  return {
    id,
    tripId,
    expenseId,
    storagePath: path,
    contentType: file.type || "application/octet-stream",
    byteSize: file.size,
    createdAt: new Date().toISOString(),
  };
}

export async function getReceiptSignedUrl(path: string): Promise<string> {
  const sb = getSupabase();
  const res = await sb.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (res.error) throw toApiError(res.error);
  return res.data.signedUrl;
}

export async function deleteReceipt(
  id: string,
  storagePath: string,
): Promise<void> {
  const sb = getSupabase();
  await sb.storage.from(BUCKET).remove([storagePath]);
  await apiMutate((client) =>
    client.from("expense_receipts").delete().eq("id", id),
  );
}
