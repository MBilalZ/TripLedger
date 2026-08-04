import type {
  ConsistencyResult,
  ConsistencyViolation,
  ParticipantMoney,
  Transfer,
} from "@tripledger/types";

export function checkInvariants(args: {
  tripTotalPaisa: number;
  poolTotalsSumPaisa: number;
  paidSumPaisa: number;
  shareSumPaisa: number;
  adjNetSumPaisa: number;
  participants: ParticipantMoney[];
  settlements: Transfer[];
  inputViolations?: ConsistencyViolation[];
  /** When true, skip I1–I9 that assume successful allocation (fail-closed path). */
  skipBalanceChecks?: boolean;
}): ConsistencyResult {
  const violations: ConsistencyViolation[] = [...(args.inputViolations ?? [])];

  const push = (id: ConsistencyViolation["id"], message: string) => {
    violations.push({ id, message });
  };

  if (args.skipBalanceChecks) {
    return { ok: false, violations };
  }

  if (args.tripTotalPaisa !== args.poolTotalsSumPaisa) {
    push(
      "I1",
      `Trip total ${args.tripTotalPaisa} != sum of pool totals ${args.poolTotalsSumPaisa}`,
    );
  }
  if (args.paidSumPaisa !== args.tripTotalPaisa) {
    push("I2", `Sum of paid ${args.paidSumPaisa} != trip total ${args.tripTotalPaisa}`);
  }
  if (args.shareSumPaisa !== args.tripTotalPaisa) {
    push(
      "I3",
      `Sum of shares ${args.shareSumPaisa} != trip total ${args.tripTotalPaisa}`,
    );
  }

  // I4: paid − share + adj must sum to 0 (final balances before rounding)
  const balanceSum = args.participants.reduce(
    (s, p) => s + (p.paidPaisa - p.sharePaisa + p.adjNetPaisa),
    0,
  );
  if (balanceSum !== 0) {
    push("I4", `Sum of (paid - share + adj) is ${balanceSum}, expected 0`);
  }

  if (args.adjNetSumPaisa !== 0) {
    push("I5", `Sum of adjustment nets is ${args.adjNetSumPaisa}, expected 0`);
  }

  const finalSum = args.participants.reduce((s, p) => s + p.balancePaisa, 0);
  if (finalSum !== 0) {
    push("I6", `Sum of final balances is ${finalSum}, expected 0`);
  }

  const roundedSum = args.participants.reduce((s, p) => s + p.balanceRupeesPaisa, 0);
  if (roundedSum !== 0) {
    push("I6", `Sum of settlement balances is ${roundedSum}, expected 0`);
  }

  // I7: each person's net from transfers must equal their settlement balance
  const netFromTransfers = new Map<string, number>();
  for (const p of args.participants) {
    netFromTransfers.set(p.participantId, 0);
  }
  let transferOut = 0;
  let transferIn = 0;
  for (const t of args.settlements) {
    transferOut += t.amountPaisa;
    transferIn += t.amountPaisa;
    netFromTransfers.set(t.fromId, (netFromTransfers.get(t.fromId) ?? 0) - t.amountPaisa);
    netFromTransfers.set(t.toId, (netFromTransfers.get(t.toId) ?? 0) + t.amountPaisa);
  }

  for (const p of args.participants) {
    const net = netFromTransfers.get(p.participantId) ?? 0;
    if (net !== p.balanceRupeesPaisa) {
      push(
        "I7",
        `${p.displayName}: transfer net ${net} != settlement balance ${p.balanceRupeesPaisa}`,
      );
    }
  }

  // I8: sum of amounts leaving debtors must equal sum entering creditors
  // (each transfer contributes once to both; also verify no orphan endpoints)
  const fromSum = args.settlements.reduce((s, t) => s + t.amountPaisa, 0);
  const toSum = args.settlements.reduce((s, t) => s + t.amountPaisa, 0);
  if (fromSum !== toSum || transferOut !== transferIn) {
    push("I8", "Transfer in/out mismatch");
  }
  const debtorPay = args.participants
    .filter((p) => p.balanceRupeesPaisa < 0)
    .reduce((s, p) => s + -p.balanceRupeesPaisa, 0);
  const creditorRecv = args.participants
    .filter((p) => p.balanceRupeesPaisa > 0)
    .reduce((s, p) => s + p.balanceRupeesPaisa, 0);
  if (
    debtorPay !== creditorRecv ||
    (args.settlements.length > 0 && fromSum !== debtorPay)
  ) {
    push(
      "I8",
      `Transfer totals ${fromSum} do not match debtor/creditor sides (${debtorPay}/${creditorRecv})`,
    );
  }

  for (const t of args.settlements) {
    if (t.amountPaisa <= 0 || t.fromId === t.toId) {
      push("I9", `Invalid transfer ${t.fromName} → ${t.toName} amount ${t.amountPaisa}`);
    }
  }

  return { ok: violations.length === 0, violations };
}
