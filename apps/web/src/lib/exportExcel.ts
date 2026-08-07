import { settleTrip } from "@tripledger/engine";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { db } from "@/db/dexie";
import { loadTripFacts } from "@/lib/tripFacts";
import {
  buildTripReport,
  reportAmountRupees,
  type ChartSlice,
  type TripReport,
} from "@/lib/tripReport";

export async function exportTripExcel(tripId: string): Promise<void> {
  const trip = await db.trips.get(tripId);
  if (!trip) throw new Error("Trip not found");
  const facts = await loadTripFacts(tripId);
  const settlement = settleTrip(facts);
  const report = buildTripReport({
    tripName: trip.name,
    currency: trip.currency,
    settlement,
    expenses: facts.expenses,
    pools: facts.pools,
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "TripLedger";

  writeSummarySheet(wb, report);
  writePerFriendSheet(wb, report);
  writeTransfersSheet(wb, report);
  writeChartsSheet(wb, report);

  const buf = await wb.xlsx.writeBuffer();
  const safe = trip.name.replace(/[^\w-]+/g, "_");
  saveAs(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `tripledger-${safe}.xlsx`,
  );
}

function writeSummarySheet(wb: ExcelJS.Workbook, report: TripReport) {
  const sheet = wb.addWorksheet("Summary");
  sheet.addRow(["Trip", report.tripName]);
  sheet.addRow(["Currency", report.currency]);
  sheet.addRow(["Total (Rs)", reportAmountRupees(report.tripTotalPaisa, 0)]);
  sheet.addRow(["Status", report.balancedLabel]);
  sheet.addRow(["Members", report.memberCount]);
}

function writePerFriendSheet(wb: ExcelJS.Workbook, report: TripReport) {
  const sheet = wb.addWorksheet("Per friend");
  sheet.addRow(["Name", "Paid", "Share", "Adj Net", "Balance"]);
  for (const p of report.participants) {
    sheet.addRow([
      p.displayName,
      reportAmountRupees(p.paidPaisa, 0),
      reportAmountRupees(p.sharePaisa, 2),
      reportAmountRupees(p.adjNetPaisa, 2),
      reportAmountRupees(p.balancePaisa, 2),
    ]);
  }
}

function writeTransfersSheet(wb: ExcelJS.Workbook, report: TripReport) {
  const sheet = wb.addWorksheet("Suggested transfers");
  sheet.addRow(["From", "To", "Amount"]);
  if (report.transfers.length === 0) {
    sheet.addRow(["", "", "No transfers needed — everyone is settled."]);
    return;
  }
  for (const t of report.transfers) {
    sheet.addRow([t.fromName, t.toName, reportAmountRupees(t.amountPaisa, 2)]);
  }
}

function writeChartsSheet(wb: ExcelJS.Workbook, report: TripReport) {
  const sheet = wb.addWorksheet("Charts");
  sheet.addRow(["Section", "Name", "Amount", "Pct"]);
  appendChartRows(sheet, "By pool", report.charts.byPool);
  appendChartRows(sheet, "By category", report.charts.byCategory);
  appendChartRows(sheet, "Paid by person", report.charts.byPersonPaid);
  appendChartRows(sheet, "Share by person", report.charts.byPersonShare);
}

function appendChartRows(
  sheet: ExcelJS.Worksheet,
  section: string,
  slices: ChartSlice[],
) {
  if (slices.length === 0) {
    sheet.addRow([section, "None", "", ""]);
    return;
  }
  for (const s of slices) {
    sheet.addRow([section, s.name, reportAmountRupees(s.paisa, 0), s.pct]);
  }
}
