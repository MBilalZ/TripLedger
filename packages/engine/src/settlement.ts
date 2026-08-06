import type { Id, Transfer } from "@tripledger/types";

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

function transfer(from: Party, to: Party, amount: number): Transfer | null {
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

/** Always minimize transfers. */
export function buildTransfers(
  balances: Array<{
    participantId: Id;
    displayName: string;
    balancePaisa: number;
  }>,
): Transfer[] {
  return optimizeTransfers(balances);
}
