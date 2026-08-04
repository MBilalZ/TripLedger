import type { Id, Transfer, TransferMode } from "@tripledger/types";
import { allocateByWeights } from "./allocation.js";

interface Party {
  id: Id;
  name: string;
  amount: number;
}

function toParties(
  balances: Array<{
    participantId: Id;
    displayName: string;
    balancePaisa: number;
  }>,
): { debtors: Party[]; creditors: Party[] } {
  const debtors: Party[] = [];
  const creditors: Party[] = [];
  for (const b of balances) {
    if (b.balancePaisa < 0) {
      debtors.push({
        id: b.participantId,
        name: b.displayName,
        amount: -b.balancePaisa,
      });
    } else if (b.balancePaisa > 0) {
      creditors.push({
        id: b.participantId,
        name: b.displayName,
        amount: b.balancePaisa,
      });
    }
  }
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);
  return { debtors, creditors };
}

function transfer(
  from: Party,
  to: Party,
  amount: number,
): Transfer | null {
  if (amount <= 0) return null;
  return {
    fromId: from.id,
    fromName: from.name,
    toId: to.id,
    toName: to.name,
    amountPaisa: amount,
    amountRupees: amount / 100,
  };
}

/** Classic greedy min-transfer matching. */
export function optimizeTransfers(
  balances: Array<{
    participantId: Id;
    displayName: string;
    balancePaisa: number;
  }>,
): Transfer[] {
  const { debtors, creditors } = toParties(balances);
  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i]!;
    const c = creditors[j]!;
    const amount = Math.min(d.amount, c.amount);
    const t = transfer(d, c, amount);
    if (t) transfers.push(t);
    d.amount -= amount;
    c.amount -= amount;
    if (d.amount === 0) i += 1;
    if (c.amount === 0) j += 1;
  }
  return transfers;
}

/** Every debtor pays the hub; hub pays every other creditor. */
export function settleToOne(
  balances: Array<{
    participantId: Id;
    displayName: string;
    balancePaisa: number;
  }>,
  hubId: Id | null,
): Transfer[] {
  const { debtors, creditors } = toParties(balances);
  if (debtors.length === 0 && creditors.length === 0) return [];

  let hub =
    (hubId &&
      [...debtors, ...creditors].find((p) => p.id === hubId)) ||
    null;
  if (!hub) {
    hub = creditors[0] ?? debtors[0] ?? null;
  }
  if (!hub) return [];

  const transfers: Transfer[] = [];
  const nameById = new Map(
    balances.map((b) => [b.participantId, b.displayName] as const),
  );

  for (const d of debtors) {
    if (d.id === hub.id) continue;
    const t = transfer(
      d,
      { id: hub.id, name: hub.name, amount: 0 },
      d.amount,
    );
    if (t) {
      t.toName = nameById.get(hub.id) ?? hub.name;
      transfers.push(t);
    }
  }

  for (const c of creditors) {
    if (c.id === hub.id) continue;
    const t = transfer(
      { id: hub.id, name: nameById.get(hub.id) ?? hub.name, amount: 0 },
      c,
      c.amount,
    );
    if (t) transfers.push(t);
  }

  return transfers;
}

/**
 * Each debtor pays each creditor proportionally to that creditor's share of
 * total credit (largest-remainder so amounts sum exactly).
 */
export function pairwiseTransfers(
  balances: Array<{
    participantId: Id;
    displayName: string;
    balancePaisa: number;
  }>,
): Transfer[] {
  const { debtors, creditors } = toParties(balances);
  if (debtors.length === 0 || creditors.length === 0) return [];

  const transfers: Transfer[] = [];
  for (const d of debtors) {
    const alloc = allocateByWeights(
      d.amount,
      creditors.map((c) => ({ participantId: c.id, weight: c.amount })),
    );
    if (alloc.error) continue;
    for (const slice of alloc.slices) {
      if (slice.sharePaisa <= 0) continue;
      const c = creditors.find((x) => x.id === slice.participantId)!;
      transfers.push({
        fromId: d.id,
        fromName: d.name,
        toId: c.id,
        toName: c.name,
        amountPaisa: slice.sharePaisa,
        amountRupees: slice.sharePaisa / 100,
      });
    }
  }
  return transfers;
}

export function buildTransfers(
  balances: Array<{
    participantId: Id;
    displayName: string;
    balancePaisa: number;
  }>,
  mode: TransferMode,
  hubId: Id | null,
): Transfer[] {
  switch (mode) {
    case "settle_to_one":
      return settleToOne(balances, hubId);
    case "pairwise":
      return pairwiseTransfers(balances);
    case "minimize":
    default:
      return optimizeTransfers(balances);
  }
}
