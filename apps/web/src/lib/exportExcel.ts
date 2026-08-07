import { settleTrip } from "@tripledger/engine";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { db } from "@/db/dexie";
import { loadTripFacts } from "@/lib/tripFacts";
import {
  buildSettlementReport,
  reportAmountRupees,
  type SettlementReport,
} from "@/lib/tripReport";

export async function exportTripExcel(tripId: string): Promise<void> {
  const trip = await db.trips.get(tripId);
  if (!trip) throw new Error("Trip not found");
  const facts = await loadTripFacts(tripId);
  const settlement = settleTrip(facts);
  const report = buildSettlementReport({
    tripName: trip.name,
    currency: trip.currency,
    facts,
    settlement,
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "TripLedger";
  const sheet = wb.addWorksheet("Settlement");
  writeSettlementSheet(sheet, report);

  const buf = await wb.xlsx.writeBuffer();
  const safe = trip.name.replace(/[^\w-]+/g, "_");
  saveAs(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `tripledger-${safe}.xlsx`,
  );
}

function sectionTitle(sheet: ExcelJS.Worksheet, title: string) {
  const row = sheet.addRow([title]);
  row.font = { bold: true, size: 13 };
}

function spacer(sheet: ExcelJS.Worksheet) {
  sheet.addRow([]);
}

function writeSettlementSheet(sheet: ExcelJS.Worksheet, report: SettlementReport) {
  sectionTitle(sheet, "Expense Settlement Summary");
  sheet.addRow(["Trip", report.tripName]);
  sheet.addRow(["Currency", report.currency]);
  sheet.addRow(["Total Trip Expense", reportAmountRupees(report.tripTotalPaisa, 0)]);
  sheet.addRow(["Status", report.balancedLabel]);
  spacer(sheet);

  sectionTitle(sheet, "Expense List");
  sheet.addRow(["Date", "Description", "Category", "Pool", "Payer", "Amount"]);
  for (const e of report.expenses) {
    sheet.addRow([
      e.date,
      e.description,
      e.category,
      e.poolName,
      e.payerName,
      reportAmountRupees(e.amountPaisa, 0),
    ]);
  }
  spacer(sheet);

  sectionTitle(sheet, "1. Payments");
  sheet.addRow(["Person", "Paid"]);
  for (const p of report.payments) {
    sheet.addRow([p.displayName, reportAmountRupees(p.paidPaisa, 0)]);
  }
  const totalRow = sheet.addRow(["Total", reportAmountRupees(report.paymentsTotalPaisa, 0)]);
  totalRow.font = { bold: true };
  spacer(sheet);

  for (const pool of report.pools) {
    sectionTitle(sheet, pool.name);
    sheet.addRow(["Pool total", reportAmountRupees(pool.totalPaisa, 0)]);
    sheet.addRow([pool.sharedAmongLabel]);
    if (pool.costPerUnitLabel) {
      sheet.addRow(["Cost per person", pool.costPerUnitLabel]);
    }
    sheet.addRow(["Person", pool.weightColumn, "Share"]);
    for (const m of pool.members) {
      sheet.addRow([
        m.displayName,
        pool.splitMode === "percent" || pool.splitMode === "exact"
          ? m.weightLabel
          : m.weight,
        reportAmountRupees(m.sharePaisa, 2),
      ]);
    }
    spacer(sheet);
  }

  sectionTitle(sheet, "Total each person should contribute");
  const matrixHeader = ["Person", ...report.poolNames, "Total Share"];
  sheet.addRow(matrixHeader);
  for (const row of report.matrix) {
    sheet.addRow([
      row.displayName,
      ...row.cells.map((c) =>
        c.sharePaisa === 0 ? "—" : reportAmountRupees(c.sharePaisa, 2),
      ),
      reportAmountRupees(row.totalSharePaisa, 2),
    ]);
  }
  spacer(sheet);

  sectionTitle(sheet, "Compare with actual payments");
  sheet.addRow(["Person", "Paid", "Should Pay", "Difference"]);
  for (const c of report.compare) {
    sheet.addRow([
      c.displayName,
      reportAmountRupees(c.paidPaisa, 2),
      reportAmountRupees(c.shouldPayPaisa, 2),
      reportAmountRupees(c.differencePaisa, 2),
    ]);
  }
  sheet.addRow(["Check", report.differenceChecksumLabel]);
  spacer(sheet);

  if (report.adjustments.length > 0) {
    sectionTitle(sheet, "Adjustments");
    sheet.addRow(["From", "To", "Amount", "Reason"]);
    for (const a of report.adjustments) {
      sheet.addRow([
        a.fromName,
        a.toName,
        reportAmountRupees(a.amountPaisa, 2),
        a.reason,
      ]);
    }
    spacer(sheet);
  }

  sectionTitle(sheet, "Final Settlement");
  sheet.addRow(["From", "To", "Amount", "Rounded (nearest Rs)"]);
  if (report.transfers.length === 0) {
    sheet.addRow(["", "", "No transfers needed — everyone is settled.", ""]);
  } else {
    for (const t of report.transfers) {
      sheet.addRow([
        t.fromName,
        t.toName,
        reportAmountRupees(t.amountPaisa, 2),
        t.roundedRupees,
      ]);
    }
  }
}
