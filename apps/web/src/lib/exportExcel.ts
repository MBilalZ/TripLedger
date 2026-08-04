import { paisaToRupees, settleTrip } from "@tripledger/engine";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { db } from "@/db/dexie";
import { loadTripFacts } from "@/lib/tripFacts";

export async function exportTripExcel(tripId: string): Promise<void> {
  const trip = await db.trips.get(tripId);
  if (!trip) throw new Error("Trip not found");
  const facts = await loadTripFacts(tripId);
  const result = settleTrip(facts);

  const wb = new ExcelJS.Workbook();
  wb.creator = "TripLedger";

  const summary = wb.addWorksheet("Summary");
  summary.addRow(["Trip", trip.name]);
  summary.addRow(["Currency", trip.currency]);
  summary.addRow(["Trip Total (Rs)", paisaToRupees(result.summary.tripTotalPaisa)]);
  summary.addRow(["Balanced", result.consistency.ok ? "YES" : "NO"]);
  summary.addRow([]);
  summary.addRow(["Pool", "Mode", "Total Rs", "Heads/Weight"]);
  for (const p of result.pools) {
    summary.addRow([p.name, p.splitMode, paisaToRupees(p.totalPaisa), p.headCount]);
  }

  const people = wb.addWorksheet("Participants");
  people.addRow(["Name", "Paid", "Share", "Adj Net", "Balance", "Settle Rs"]);
  for (const p of result.participants) {
    people.addRow([
      p.displayName,
      paisaToRupees(p.paidPaisa),
      paisaToRupees(p.sharePaisa),
      paisaToRupees(p.adjNetPaisa),
      paisaToRupees(p.balancePaisa),
      paisaToRupees(p.balanceRupeesPaisa),
    ]);
  }

  const expenses = wb.addWorksheet("Expenses");
  expenses.addRow([
    "Date",
    "Description",
    "Category",
    "Pool",
    "Payer",
    "Amount Rs",
    "Notes",
  ]);
  const poolName = new Map(facts.pools.map((p) => [p.id, p.name]));
  const payerName = new Map(facts.participants.map((p) => [p.id, p.displayName]));
  for (const e of facts.expenses) {
    expenses.addRow([
      e.date ?? "",
      e.description,
      e.category ?? "",
      poolName.get(e.poolId) ?? e.poolId,
      payerName.get(e.paidById) ?? e.paidById,
      paisaToRupees(e.amountPaisa),
      e.notes ?? "",
    ]);
  }

  const settle = wb.addWorksheet("Settlement");
  settle.addRow(["From", "To", "Amount Rs"]);
  for (const t of result.settlements) {
    settle.addRow([t.fromName, t.toName, t.amountRupees]);
  }

  const buf = await wb.xlsx.writeBuffer();
  const safe = trip.name.replace(/[^\w-]+/g, "_");
  saveAs(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `tripledger-${safe}.xlsx`,
  );
}
