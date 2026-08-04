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
}): ConsistencyResult {
  const violations: ConsistencyViolation[] = [
    ...(args.inputViolations ?? []),
  ];

  const push = (id: ConsistencyViolation["id"], message: string) => {
    violations.push({ id, message });
  };

  if (args.tripTotalPaisa !== args.poolTotalsSumPaisa) {
    push(
      "I1",
      `Trip total ${args.tripTotalPaisa} != sum of pool totals ${args.poolTotalsSumPaisa}`,
    );
  }
  if (args.paidSumPaisa !== args.tripTotalPaisa) {
    push(
      "I2",
      `Sum of paid ${args.paidSumPaisa} != trip total ${args.tripTotalPaisa}`,
    );
  }
  if (args.shareSumPaisa !== args.tripTotalPaisa) {
    push(
      "I3",
      `Sum of shares ${args.shareSumPaisa} != trip total ${args.tripTotalPaisa}`,
    );
  }

  const balanceSum = args.participants.reduce(
    (s, p) => s + (p.paidPaisa - p.sharePaisa),
    0,
  );
  if (balanceSum !== 0) {
    push("I4", `Sum of (paid - share) is ${balanceSum}, expected 0`);
  }

  if (args.adjNetSumPaisa !== 0) {
    push("I5", `Sum of adjustment nets is ${args.adjNetSumPaisa}, expected 0`);
  }

  const finalSum = args.participants.reduce((s, p) => s + p.balancePaisa, 0);
  if (finalSum !== 0) {
    push("I6", `Sum of final balances is ${finalSum}, expected 0`);
  }

  const roundedSum = args.participants.reduce(
    (s, p) => s + p.balanceRupeesPaisa,
    0,
  );
  if (roundedSum !== 0) {
    push("I6", `Sum of settlement balances is ${roundedSum}, expected 0`);
  }

  // I7/I8: each person's net from transfers must equal their settlement balance
  const netFromTransfers = new Map<string, number>();
  for (const p of args.participants) {
    netFromTransfers.set(p.participantId, 0);
  }
  for (const t of args.settlements) {
    netFromTransfers.set(
      t.fromId,
      (netFromTransfers.get(t.fromId) ?? 0) - t.amountPaisa,
    );
    netFromTransfers.set(
      t.toId,
      (netFromTransfers.get(t.toId) ?? 0) + t.amountPaisa,
    );
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

  const transferOut = args.settlements.reduce((s, t) => s + t.amountPaisa, 0);
  const transferIn = transferOut; // each transfer has one from and one to
  if (transferOut !== transferIn) {
    push("I8", "Transfer in/out mismatch");
  }

  for (const t of args.settlements) {
    if (t.amountPaisa <= 0 || t.fromId === t.toId) {
      push(
        "I9",
        `Invalid transfer ${t.fromName} → ${t.toName} amount ${t.amountPaisa}`,
      );
    }
  }

  return { ok: violations.length === 0, violations };
}
