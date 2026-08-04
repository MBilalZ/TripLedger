export type { OutboxOpType, OutboxRow, SyncMetaRow } from "@/db/dexie";

export type SyncStatusKind = "idle" | "offline" | "syncing" | "pending" | "error";
