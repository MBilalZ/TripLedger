import Dexie, { type Table } from "dexie";
import type {
  SettlementRounding,
  SplitMode,
  TransferMode,
} from "@tripledger/types";

export interface TripRow {
  id: string;
  name: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
  transferMode: TransferMode;
  settlementRounding: SettlementRounding;
  settlementHubId: string | null;
  /** Set when this trip row is a cloud-mode cache entry for a signed-in user. */
  cloudUserId?: string | null;
}

export type OutboxOpType =
  | "addParticipant"
  | "removeParticipant"
  | "updateParticipant"
  | "updateTrip"
  | "addPool"
  | "removePool"
  | "updatePool"
  | "upsertPoolMember"
  | "addExpense"
  | "reviseExpense"
  | "voidExpense"
  | "addAdjustment"
  | "updateAdjustment"
  | "removeAdjustments"
  | "updateSettlementSettings"
  | "createTrip"
  | "deleteTrip"
  | "touchTrip";

export interface OutboxRow {
  id: string;
  tripId: string;
  op: OutboxOpType;
  payload: unknown;
  createdAt: string;
  retries: number;
  lastError: string | null;
}

export interface SyncMetaRow {
  tripId: string;
  userId: string;
  lastPulledAt: string | null;
  serverUpdatedAt: string | null;
  myRole: "owner" | "member" | null;
}

export interface ParticipantRow {
  id: string;
  tripId: string;
  displayName: string;
}

export interface PoolRow {
  id: string;
  tripId: string;
  name: string;
  splitMode: SplitMode;
}

export interface PoolMemberRow {
  id: string;
  tripId: string;
  poolId: string;
  participantId: string;
  included: boolean;
  shares: number;
  percentBps: number;
  exactPaisa: number;
  /** @deprecated migrated to shares */
  headCount?: number;
}

export interface ExpenseRow {
  id: string;
  tripId: string;
  poolId: string;
  description: string;
  category: string;
  amountPaisa: number;
  paidById: string;
  date: string;
  notes: string;
  supersededById: string | null;
  createdAt: string;
  splitMode: SplitMode | null;
  /** Soft-void; preferred over fake superseded_by_id sentinels. */
  voided?: boolean;
}

export interface ExpenseSplitRow {
  id: string;
  tripId: string;
  expenseId: string;
  participantId: string;
  included: boolean;
  shares: number;
  percentBps: number;
  exactPaisa: number;
}

export interface AdjustmentRow {
  id: string;
  tripId: string;
  fromId: string;
  toId: string;
  amountPaisa: number;
  reason: string;
  createdAt: string;
  /** Groups fan-out rows from a split-total adjustment. */
  groupId?: string | null;
}

export interface ReceiptRow {
  id: string;
  tripId: string;
  expenseId: string;
  mime: string;
  blob: Blob;
  createdAt: string;
}

export class TripLedgerDB extends Dexie {
  trips!: Table<TripRow, string>;
  participants!: Table<ParticipantRow, string>;
  pools!: Table<PoolRow, string>;
  poolMembers!: Table<PoolMemberRow, string>;
  expenses!: Table<ExpenseRow, string>;
  expenseSplits!: Table<ExpenseSplitRow, string>;
  adjustments!: Table<AdjustmentRow, string>;
  receipts!: Table<ReceiptRow, string>;
  syncMeta!: Table<SyncMetaRow, string>;
  outbox!: Table<OutboxRow, string>;

  constructor() {
    super("tripledger");
    this.version(1).stores({
      trips: "id, updatedAt",
      participants: "id, tripId, displayName",
      pools: "id, tripId, name",
      poolMembers: "id, tripId, poolId, [poolId+participantId]",
      expenses: "id, tripId, poolId, supersededById, createdAt",
      adjustments: "id, tripId, createdAt",
      receipts: "id, tripId, expenseId",
    });
    this.version(2)
      .stores({
        trips: "id, updatedAt",
        participants: "id, tripId, displayName",
        pools: "id, tripId, name",
        poolMembers: "id, tripId, poolId, [poolId+participantId]",
        expenses: "id, tripId, poolId, supersededById, createdAt",
        expenseSplits: "id, tripId, expenseId, [expenseId+participantId]",
        adjustments: "id, tripId, createdAt",
        receipts: "id, tripId, expenseId",
      })
      .upgrade(async (tx) => {
        await tx
          .table("trips")
          .toCollection()
          .modify((t: TripRow) => {
            t.transferMode = t.transferMode ?? "minimize";
            t.settlementRounding = t.settlementRounding ?? "rupee";
            t.settlementHubId = t.settlementHubId ?? null;
          });
        await tx
          .table("pools")
          .toCollection()
          .modify((p: PoolRow) => {
            p.splitMode = p.splitMode ?? "shares";
          });
        await tx
          .table("poolMembers")
          .toCollection()
          .modify((m: PoolMemberRow) => {
            const shares = m.shares ?? m.headCount ?? 1;
            m.included = m.included ?? shares > 0;
            m.shares = Math.max(1, shares || 1);
            m.percentBps = m.percentBps ?? 0;
            m.exactPaisa = m.exactPaisa ?? 0;
          });
        await tx
          .table("expenses")
          .toCollection()
          .modify((e: ExpenseRow) => {
            e.splitMode = e.splitMode ?? null;
          });
      });
    this.version(3).stores({
      trips: "id, updatedAt, cloudUserId",
      participants: "id, tripId, displayName",
      pools: "id, tripId, name",
      poolMembers: "id, tripId, poolId, [poolId+participantId]",
      expenses: "id, tripId, poolId, supersededById, createdAt",
      expenseSplits: "id, tripId, expenseId, [expenseId+participantId]",
      adjustments: "id, tripId, createdAt",
      receipts: "id, tripId, expenseId",
      syncMeta: "tripId, userId",
      outbox: "id, tripId, createdAt",
    });
  }
}

export const db = new TripLedgerDB();

export function newId(prefix = "id"): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
