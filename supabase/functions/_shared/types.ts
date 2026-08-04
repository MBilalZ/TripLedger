/** All money amounts in the domain are integer paisa (1 PKR = 100 paisa). */

export type Id = string;

export type SplitMode = "equal" | "shares" | "percent" | "exact";

export type TransferMode = "minimize" | "settle_to_one" | "pairwise";

export type SettlementRounding = "rupee" | "none";

export interface Participant {
  id: Id;
  displayName: string;
}

export interface Pool {
  id: Id;
  name: string;
  /** Default split mode for expenses in this pool. */
  splitMode: SplitMode;
}

/** Per-participant split weights for a pool (default) or expense override. */
export interface SplitLine {
  participantId: Id;
  /** When false, person is excluded from this split. */
  included: boolean;
  /** Used when mode = shares (heads). Ignored otherwise. */
  shares: number;
  /** Basis points when mode = percent (10000 = 100%). */
  percentBps: number;
  /** Absolute paisa when mode = exact. */
  exactPaisa: number;
}

export interface PoolMember extends SplitLine {
  poolId: Id;
}

export interface ExpenseSplit extends SplitLine {
  expenseId: Id;
}

export interface Expense {
  id: Id;
  poolId: Id;
  description: string;
  category?: string;
  amountPaisa: number;
  paidById: Id;
  date?: string;
  notes?: string;
  supersededById?: Id | null;
  /**
   * null/undefined => inherit pool splitMode + pool members.
   * Set => use this mode with ExpenseSplit rows for this expense.
   */
  splitMode?: SplitMode | null;
}

export interface Adjustment {
  id: Id;
  fromId: Id;
  toId: Id;
  amountPaisa: number;
  reason?: string;
}

export interface TripSettings {
  transferMode: TransferMode;
  settlementRounding: SettlementRounding;
  /** Hub participant for settle_to_one; null = largest creditor. */
  settlementHubId: Id | null;
}

export interface TripFacts {
  participants: Participant[];
  pools: Pool[];
  poolMembers: PoolMember[];
  expenses: Expense[];
  expenseSplits: ExpenseSplit[];
  adjustments: Adjustment[];
  settings: TripSettings;
}

export type InvariantId =
  | "I1"
  | "I2"
  | "I3"
  | "I4"
  | "I5"
  | "I6"
  | "I7"
  | "I8"
  | "I9"
  | "INPUT";

export interface ConsistencyViolation {
  id: InvariantId;
  message: string;
}

export interface ConsistencyResult {
  ok: boolean;
  violations: ConsistencyViolation[];
}

export interface ParticipantMoney {
  participantId: Id;
  displayName: string;
  paidPaisa: number;
  sharePaisa: number;
  adjNetPaisa: number;
  balancePaisa: number;
  /** Balance used for transfers (rounded or exact per settings). */
  balanceRupeesPaisa: number;
}

export interface PoolSummary {
  poolId: Id;
  name: string;
  splitMode: SplitMode;
  totalPaisa: number;
  /** Sum of shares/heads among included members (informative). */
  headCount: number;
  costPerHeadPaisa: number;
}

export interface Transfer {
  fromId: Id;
  fromName: string;
  toId: Id;
  toName: string;
  amountPaisa: number;
  amountRupees: number;
}

export interface TripSummary {
  tripTotalPaisa: number;
  participantCount: number;
  poolCount: number;
  expenseCount: number;
  adjustmentCount: number;
  transferMode: TransferMode;
  settlementRounding: SettlementRounding;
}

export interface SettleTripResult {
  summary: TripSummary;
  pools: PoolSummary[];
  participants: ParticipantMoney[];
  settlements: Transfer[];
  consistency: ConsistencyResult;
}

export const DEFAULT_TRIP_SETTINGS: TripSettings = {
  transferMode: "minimize",
  settlementRounding: "rupee",
  settlementHubId: null,
};
