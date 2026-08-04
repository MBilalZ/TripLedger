import type { SettlementRounding, SplitMode, TransferMode } from "@tripledger/types";
import type { CreateTripOptions } from "@/api/trips";
import type { WorkspaceSnapshot } from "@/api/workspace";
import type {
  AdjustmentRow,
  ExpenseRow,
  ExpenseSplitRow,
  ParticipantRow,
  PoolMemberRow,
  PoolRow,
  TripRow,
} from "@/db/dexie";

export type { CreateTripOptions, WorkspaceSnapshot };

export type ExpenseInput = {
  poolId: string;
  description: string;
  category: string;
  amountRupees: number;
  paidById: string;
  date: string;
  notes: string;
  splitMode: SplitMode | null;
  splits?: Array<{
    participantId: string;
    included: boolean;
    shares: number;
    percentBps: number;
    exactPaisa: number;
  }>;
};

export type AdjustmentInput = {
  fromId: string;
  toId: string;
  amountRupees: number;
  reason: string;
  groupId?: string | null;
};

export type PoolMemberPatch = Partial<
  Pick<PoolMemberRow, "included" | "shares" | "percentBps" | "exactPaisa">
>;

export interface TripListRepo {
  list(): Promise<TripRow[]>;
  create(name: string, options?: CreateTripOptions): Promise<string>;
  delete(tripId: string): Promise<void>;
  touch(tripId: string): Promise<void>;
}

export interface WorkspaceRepo {
  load(tripId: string): Promise<WorkspaceSnapshot>;
  touch(tripId: string): Promise<void>;

  addParticipant(
    tripId: string,
    displayName: string,
    pools: PoolRow[],
  ): Promise<{ participant: ParticipantRow; members: PoolMemberRow[] }>;

  removeParticipant(participantId: string): Promise<void>;

  updateParticipant(id: string, displayName: string): Promise<void>;

  updateTrip(tripId: string, patch: { name?: string }): Promise<Partial<TripRow>>;

  addPool(
    tripId: string,
    name: string,
    participants: ParticipantRow[],
  ): Promise<{ pool: PoolRow; members: PoolMemberRow[] }>;

  removePool(poolId: string): Promise<void>;

  updatePool(
    id: string,
    patch: { name?: string; splitMode?: SplitMode },
  ): Promise<Partial<PoolRow>>;

  upsertPoolMember(
    tripId: string,
    poolId: string,
    participantId: string,
    existing: PoolMemberRow | undefined,
    patch: PoolMemberPatch,
  ): Promise<PoolMemberRow>;

  addExpense(tripId: string, row: ExpenseRow, splits: ExpenseSplitRow[]): Promise<void>;

  reviseExpense(
    oldExpenseId: string,
    row: ExpenseRow,
    splits: ExpenseSplitRow[],
  ): Promise<void>;

  /** Second arg is tripId (cloud RPC) or legacy void sentinel (local). */
  voidExpense(expenseId: string, tripIdOrVoidId: string): Promise<void>;

  addAdjustment(row: AdjustmentRow): Promise<void>;

  updateAdjustment(
    id: string,
    patch: {
      fromId: string;
      toId: string;
      amountPaisa: number;
      reason: string;
    },
  ): Promise<void>;

  removeAdjustments(ids: string[]): Promise<void>;

  updateSettlementSettings(
    tripId: string,
    patch: {
      transferMode?: TransferMode;
      settlementRounding?: SettlementRounding;
      settlementHubId?: string | null;
    },
  ): Promise<string>;
}
