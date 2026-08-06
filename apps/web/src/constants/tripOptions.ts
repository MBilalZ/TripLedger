import type { SplitMode } from "@tripledger/types";

export const SPLIT_MODES: { label: string; value: SplitMode }[] = [
  { label: "Equal", value: "equal" },
  { label: "Shares", value: "shares" },
  { label: "Percent", value: "percent" },
  { label: "Exact amounts", value: "exact" },
];

export const EXPENSE_CATEGORIES = [
  "Fuel",
  "Food",
  "Hotel",
  "Toll",
  "Shopping",
  "Misc",
] as const;
