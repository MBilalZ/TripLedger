import { formatPkr } from "@tripledger/engine";
import { db, type TripRow } from "@/db/dexie";

export type ActivityItem = {
  id: string;
  tripId: string;
  tripName: string;
  at: string;
  kind: "expense" | "payment" | "void";
  title: string;
  detail: string;
};

export async function buildActivityFeed(
  trips: TripRow[],
  limit = 80,
): Promise<ActivityItem[]> {
  const items: ActivityItem[] = [];
  const byId = new Map(trips.map((t) => [t.id, t]));

  for (const trip of trips) {
    const [participants, expenses, adjustments] = await Promise.all([
      db.participants.where("tripId").equals(trip.id).toArray(),
      db.expenses.where("tripId").equals(trip.id).toArray(),
      db.adjustments.where("tripId").equals(trip.id).toArray(),
    ]);
    const nameOf = (id: string) =>
      participants.find((p) => p.id === id)?.displayName ?? "Someone";

    for (const e of expenses) {
      const voided = !!e.voided || !!e.supersededById;
      items.push({
        id: `exp:${e.id}`,
        tripId: trip.id,
        tripName: trip.name,
        at: e.createdAt || e.date || trip.updatedAt,
        kind: voided ? "void" : "expense",
        title: voided
          ? `Expense voided in “${trip.name}”`
          : `${nameOf(e.paidById)} added “${e.description || "Expense"}” in “${trip.name}”`,
        detail: formatPkr(e.amountPaisa),
      });
    }

    for (const a of adjustments) {
      items.push({
        id: `adj:${a.id}`,
        tripId: trip.id,
        tripName: byId.get(trip.id)?.name ?? trip.name,
        at: a.createdAt || trip.updatedAt,
        kind: "payment",
        title: `${nameOf(a.toId)} paid ${nameOf(a.fromId)} in “${trip.name}”`,
        detail: formatPkr(a.amountPaisa),
      });
    }
  }

  items.sort((a, b) => b.at.localeCompare(a.at));
  return items.slice(0, limit);
}

export function formatActivityWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (sameDay) return `Today, ${time}`;
  if (isYesterday) return `Yesterday, ${time}`;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
