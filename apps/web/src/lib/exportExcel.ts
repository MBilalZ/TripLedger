import { settleTrip } from "@tripledger/engine";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { db } from "@/db/dexie";
import { BRAND, loadBrandLogoPng } from "@/lib/exportBrand";
import { loadTripFacts } from "@/lib/tripFacts";
import {
  buildSettlementReport,
  reportAmountRupees,
  type SettlementReport,
} from "@/lib/tripReport";

const FONT = "Calibri";
const COLS = 6;

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
  wb.company = "TripLedger";

  const sheet = wb.addWorksheet("Settlement", {
    properties: { defaultRowHeight: 18 },
    views: [{ state: "frozen", ySplit: 4 }],
  });

  sheet.columns = [
    { width: 22 },
    { width: 18 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
  ];

  const logoBytes = await loadBrandLogoPng();
  const logoId = wb.addImage({
    buffer: logoBytes as unknown as ExcelJS.Buffer,
    extension: "png",
  });

  writeSettlementSheet(sheet, report, logoId);

  const buf = await wb.xlsx.writeBuffer();
  const safe = trip.name.replace(/[^\w-]+/g, "_");
  saveAs(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `tripledger-${safe}.xlsx`,
  );
}

function applyFont(
  row: ExcelJS.Row,
  opts: Partial<ExcelJS.Font> = {},
) {
  row.font = { name: FONT, size: 10, color: { argb: `FF${BRAND.text}` }, ...opts };
}

function styleBanner(sheet: ExcelJS.Worksheet, report: SettlementReport, logoId: number) {
  for (let r = 1; r <= 3; r++) {
    for (let c = 1; c <= COLS; c++) {
      const cell = sheet.getCell(r, c);
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: `FF${BRAND.teal}` },
      };
    }
  }
  sheet.getRow(1).height = 24;
  sheet.getRow(2).height = 20;
  sheet.getRow(3).height = 12;

  sheet.mergeCells(1, 2, 1, COLS);
  sheet.mergeCells(2, 2, 2, COLS);

  const title = sheet.getCell(1, 2);
  title.value = "TripLedger - Expense Settlement Summary";
  title.font = {
    name: FONT,
    bold: true,
    size: 18,
    color: { argb: `FF${BRAND.white}` },
  };
  title.alignment = { vertical: "middle", horizontal: "left" };

  const subtitle = sheet.getCell(2, 2);
  subtitle.value = `${report.tripName}  |  Total ${report.tripTotalLabel}  |  ${report.currency}  |  ${report.balancedLabel}`;
  subtitle.font = {
    name: FONT,
    size: 11,
    color: { argb: `FF${BRAND.white}` },
  };
  subtitle.alignment = { vertical: "middle" };

  sheet.addImage(logoId, {
    tl: { col: 0.2, row: 0.35 },
    ext: { width: 40, height: 40 },
  });

  sheet.getRow(4).height = 8;
}

function sectionTitle(sheet: ExcelJS.Worksheet, title: string) {
  const row = sheet.addRow([title]);
  applyFont(row, { bold: true, size: 12, color: { argb: `FF${BRAND.teal}` } });
  sheet.mergeCells(row.number, 1, row.number, COLS);
  for (let c = 1; c <= COLS; c++) {
    const cell = row.getCell(c);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${BRAND.tealLight}` },
    };
    cell.border = thinBorder();
  }
  row.height = 22;
  return row;
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const edge: Partial<ExcelJS.Border> = {
    style: "thin",
    color: { argb: `FF${BRAND.border}` },
  };
  return { top: edge, bottom: edge, left: edge, right: edge };
}

function headerRow(sheet: ExcelJS.Worksheet, labels: string[]) {
  const row = sheet.addRow(labels);
  applyFont(row, { bold: true, size: 10 });
  for (let c = 1; c <= labels.length; c++) {
    const cell = row.getCell(c);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${BRAND.slate}` },
    };
    cell.border = thinBorder();
    cell.alignment = { vertical: "middle" };
  }
  return row;
}

function dataRow(
  sheet: ExcelJS.Worksheet,
  values: (string | number | null)[],
  opts?: { bold?: boolean; moneyCols?: number[] },
) {
  const row = sheet.addRow(values);
  applyFont(row, opts?.bold ? { bold: true } : {});
  for (let c = 1; c <= values.length; c++) {
    const cell = row.getCell(c);
    cell.border = thinBorder();
    if (opts?.moneyCols?.includes(c)) {
      cell.numFmt = "#,##0.00";
      cell.alignment = { horizontal: "right" };
    }
  }
  return row;
}

function spacer(sheet: ExcelJS.Worksheet) {
  sheet.addRow([]);
}

function writeSettlementSheet(
  sheet: ExcelJS.Worksheet,
  report: SettlementReport,
  logoId: number,
) {
  styleBanner(sheet, report, logoId);

  sectionTitle(sheet, "Expense List");
  headerRow(sheet, ["Date", "Description", "Category", "Pool", "Payer", "Amount"]);
  if (report.expenses.length === 0) {
    dataRow(sheet, ["None", "", "", "", "", ""]);
  } else {
    for (const e of report.expenses) {
      dataRow(
        sheet,
        [
          e.date,
          e.description,
          e.category,
          e.poolName,
          e.payerName,
          reportAmountRupees(e.amountPaisa, 0),
        ],
        { moneyCols: [6] },
      );
    }
  }
  spacer(sheet);

  sectionTitle(sheet, "Payments");
  headerRow(sheet, ["Person", "Paid"]);
  for (const p of report.payments) {
    dataRow(sheet, [p.displayName, reportAmountRupees(p.paidPaisa, 0)], {
      moneyCols: [2],
    });
  }
  const totalRow = dataRow(
    sheet,
    ["Total", reportAmountRupees(report.paymentsTotalPaisa, 0)],
    { bold: true, moneyCols: [2] },
  );
  totalRow.getCell(1).font = {
    name: FONT,
    bold: true,
    size: 10,
    color: { argb: `FF${BRAND.teal}` },
  };
  totalRow.getCell(2).font = {
    name: FONT,
    bold: true,
    size: 10,
    color: { argb: `FF${BRAND.teal}` },
  };
  spacer(sheet);

  for (const pool of report.pools) {
    sectionTitle(sheet, pool.name);
    dataRow(sheet, ["Pool total", reportAmountRupees(pool.totalPaisa, 0)], {
      moneyCols: [2],
    });
    dataRow(sheet, [pool.sharedAmongLabel]);
    if (pool.costPerUnitLabel) {
      dataRow(sheet, ["Cost per person", pool.costPerUnitLabel]);
    }
    headerRow(sheet, ["Person", pool.weightColumn, "Share"]);
    for (const m of pool.members) {
      dataRow(
        sheet,
        [
          m.displayName,
          pool.splitMode === "percent" || pool.splitMode === "exact"
            ? m.weightLabel
            : m.weight,
          reportAmountRupees(m.sharePaisa, 2),
        ],
        { moneyCols: [3] },
      );
    }
    spacer(sheet);
  }

  sectionTitle(sheet, "Total each person should contribute");
  headerRow(sheet, ["Person", ...report.poolNames, "Total Share"]);
  for (const row of report.matrix) {
    const values: (string | number)[] = [
      row.displayName,
      ...row.cells.map((c) =>
        c.sharePaisa === 0 ? "-" : reportAmountRupees(c.sharePaisa, 2),
      ),
      reportAmountRupees(row.totalSharePaisa, 2),
    ];
    const moneyCols = values
      .map((v, i) => (typeof v === "number" ? i + 1 : -1))
      .filter((i) => i > 0);
    dataRow(sheet, values, { moneyCols });
  }
  spacer(sheet);

  sectionTitle(sheet, "Compare with actual payments");
  headerRow(sheet, ["Person", "Paid", "Should Pay", "Difference"]);
  for (const c of report.compare) {
    const row = dataRow(
      sheet,
      [
        c.displayName,
        reportAmountRupees(c.paidPaisa, 2),
        reportAmountRupees(c.shouldPayPaisa, 2),
        reportAmountRupees(c.differencePaisa, 2),
      ],
      { moneyCols: [2, 3, 4] },
    );
    const diffCell = row.getCell(4);
    diffCell.font = {
      name: FONT,
      bold: true,
      size: 10,
      color: {
        argb: `FF${c.differencePaisa >= 0 ? BRAND.ok : BRAND.danger}`,
      },
    };
    diffCell.numFmt = '+#,##0.00;-#,##0.00;0.00';
  }
  const check = dataRow(sheet, [
    "Check",
    report.differenceChecksumLabel.replace(/[✓✔]/g, "OK"),
  ]);
  applyFont(check, { italic: true, color: { argb: `FF${BRAND.muted}` } });
  spacer(sheet);

  if (report.adjustments.length > 0) {
    sectionTitle(sheet, "Adjustments");
    headerRow(sheet, ["From", "To", "Amount", "Reason"]);
    for (const a of report.adjustments) {
      dataRow(
        sheet,
        [
          a.fromName,
          a.toName,
          reportAmountRupees(a.amountPaisa, 2),
          a.reason,
        ],
        { moneyCols: [3] },
      );
    }
    spacer(sheet);
  }

  sectionTitle(sheet, "Final Settlement");
  headerRow(sheet, ["From", "To", "Amount", "Rounded (nearest Rs)"]);
  if (report.transfers.length === 0) {
    dataRow(sheet, ["", "", "No transfers needed - everyone is settled.", ""]);
  } else {
    for (const t of report.transfers) {
      const row = dataRow(
        sheet,
        [
          t.fromName,
          t.toName,
          reportAmountRupees(t.amountPaisa, 2),
          t.roundedRupees,
        ],
        { bold: true, moneyCols: [3, 4] },
      );
      row.getCell(3).font = {
        name: FONT,
        bold: true,
        size: 10,
        color: { argb: `FF${BRAND.teal}` },
      };
    }
  }
}
