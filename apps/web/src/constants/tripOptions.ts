import type { SettlementRounding, SplitMode, TransferMode } from "@tripledger/types";

export const SPLIT_MODES: { label: string; value: SplitMode }[] = [
  { label: "Equal", value: "equal" },
  { label: "Shares", value: "shares" },
  { label: "Percent", value: "percent" },
  { label: "Exact amounts", value: "exact" },
];

export const TRANSFER_MODES: { label: string; value: TransferMode }[] = [
  { label: "Minimize transactions", value: "minimize" },
  { label: "Settle to one friend", value: "settle_to_one" },
  { label: "Pairwise (proportional)", value: "pairwise" },
];

export const ROUNDING_MODES: { label: string; value: SettlementRounding }[] = [
  { label: "Whole rupees", value: "rupee" },
  { label: "Exact paisa", value: "none" },
];

export const EXPENSE_CATEGORIES = [
  "Fuel",
  "Food",
  "Hotel",
  "Toll",
  "Shopping",
  "Misc",
] as const;
