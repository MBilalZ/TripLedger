import { formatPkr, settleTrip } from "@tripledger/engine";
import { saveAs } from "file-saver";
import {
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import { db } from "@/db/dexie";
import { BRAND, hexToRgb, loadBrandLogoPng, toPdfSafeAscii } from "@/lib/exportBrand";
import { loadTripFacts } from "@/lib/tripFacts";
import {
  buildSettlementReport,
  type SettlementReport,
} from "@/lib/tripReport";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 48;
const MARGIN_RIGHT = 48;
const CONTENT_RIGHT = PAGE_WIDTH - MARGIN_RIGHT;
const MARGIN_BOTTOM = 56;
const HEADER_H = 64;
const CONT_HEADER_H = 36;

function brandRgb(hex: string): RGB {
  const { r, g, b } = hexToRgb(hex);
  return rgb(r, g, b);
}

const teal = brandRgb(BRAND.teal);
const textColor = brandRgb(BRAND.text);
const muted = brandRgb(BRAND.muted);
const white = rgb(1, 1, 1);
const ok = brandRgb(BRAND.ok);
const danger = brandRgb(BRAND.danger);
const rule = rgb(0.9, 0.92, 0.94);

type DrawOpts = {
  size?: number;
  bold?: boolean;
  color?: RGB;
  x?: number;
};

class PdfLetterhead {
  private page!: PDFPage;
  private y = 0;
  private readonly pages: PDFPage[] = [];

  constructor(
    private readonly pdf: PDFDocument,
    private readonly font: PDFFont,
    private readonly boldFont: PDFFont,
    private readonly logo: PDFImage,
    private readonly tripName: string,
  ) {}

  start() {
    this.newPage(true);
  }

  private newPage(first: boolean) {
    this.page = this.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pages.push(this.page);
    if (first) {
      this.drawMainHeader();
      this.y = PAGE_HEIGHT - HEADER_H - 28;
    } else {
      this.drawContinuationHeader();
      this.y = PAGE_HEIGHT - CONT_HEADER_H - 20;
    }
  }

  private drawMainHeader() {
    this.page.drawRectangle({
      x: 0,
      y: PAGE_HEIGHT - HEADER_H,
      width: PAGE_WIDTH,
      height: HEADER_H,
      color: teal,
    });
    const logoSize = 32;
    this.page.drawImage(this.logo, {
      x: MARGIN_X,
      y: PAGE_HEIGHT - HEADER_H + (HEADER_H - logoSize) / 2,
      width: logoSize,
      height: logoSize,
    });
    this.page.drawText("TripLedger", {
      x: MARGIN_X + logoSize + 12,
      y: PAGE_HEIGHT - 28,
      size: 16,
      font: this.boldFont,
      color: white,
    });
    this.page.drawText("Expense Settlement Summary", {
      x: MARGIN_X + logoSize + 12,
      y: PAGE_HEIGHT - 46,
      size: 10,
      font: this.font,
      color: white,
    });
  }

  private drawContinuationHeader() {
    this.page.drawRectangle({
      x: 0,
      y: PAGE_HEIGHT - CONT_HEADER_H,
      width: PAGE_WIDTH,
      height: CONT_HEADER_H,
      color: teal,
    });
    const logoSize = 18;
    this.page.drawImage(this.logo, {
      x: MARGIN_X,
      y: PAGE_HEIGHT - CONT_HEADER_H + (CONT_HEADER_H - logoSize) / 2,
      width: logoSize,
      height: logoSize,
    });
    this.page.drawText(toPdfSafeAscii(`${this.tripName} (cont.)`), {
      x: MARGIN_X + logoSize + 10,
      y: PAGE_HEIGHT - CONT_HEADER_H + 12,
      size: 10,
      font: this.boldFont,
      color: white,
    });
  }

  ensureSpace(needed: number) {
    if (this.y - needed < MARGIN_BOTTOM) {
      this.newPage(false);
    }
  }

  gap(px = 10) {
    this.y -= px;
  }

  accentRule() {
    this.ensureSpace(8);
    this.page.drawLine({
      start: { x: MARGIN_X, y: this.y },
      end: { x: CONTENT_RIGHT, y: this.y },
      thickness: 1.2,
      color: teal,
    });
    this.y -= 12;
  }

  text(raw: string, opts: DrawOpts = {}) {
    const size = opts.size ?? 10;
    const color = opts.color ?? textColor;
    const font = opts.bold ? this.boldFont : this.font;
    const x = opts.x ?? MARGIN_X;
    const safe = toPdfSafeAscii(raw);
    this.ensureSpace(size + 6);
    try {
      this.page.drawText(safe, { x, y: this.y, size, font, color });
    } catch {
      /* skip undrawable leftovers */
    }
    this.y -= size + 5;
  }

  section(title: string) {
    this.ensureSpace(28);
    this.gap(6);
    this.page.drawRectangle({
      x: MARGIN_X,
      y: this.y - 2,
      width: 3,
      height: 14,
      color: teal,
    });
    this.page.drawText(toPdfSafeAscii(title), {
      x: MARGIN_X + 10,
      y: this.y,
      size: 12,
      font: this.boldFont,
      color: teal,
    });
    this.y -= 8;
    this.page.drawLine({
      start: { x: MARGIN_X, y: this.y },
      end: { x: CONTENT_RIGHT, y: this.y },
      thickness: 0.6,
      color: rule,
    });
    this.y -= 14;
  }

  tableHeader(cols: { label: string; x: number }[]) {
    this.ensureSpace(16);
    for (const c of cols) {
      this.page.drawText(toPdfSafeAscii(c.label), {
        x: c.x,
        y: this.y,
        size: 8,
        font: this.boldFont,
        color: muted,
      });
    }
    this.y -= 4;
    this.page.drawLine({
      start: { x: MARGIN_X, y: this.y },
      end: { x: CONTENT_RIGHT, y: this.y },
      thickness: 0.5,
      color: rule,
    });
    this.y -= 12;
  }

  row(cells: { text: string; x: number; bold?: boolean; color?: RGB }[]) {
    this.ensureSpace(14);
    for (const c of cells) {
      try {
        this.page.drawText(toPdfSafeAscii(c.text), {
          x: c.x,
          y: this.y,
          size: 9,
          font: c.bold ? this.boldFont : this.font,
          color: c.color ?? textColor,
        });
      } catch {
        /* ignore */
      }
    }
    this.y -= 13;
  }

  finishFooters() {
    const total = this.pages.length;
    for (let i = 0; i < this.pages.length; i++) {
      const p = this.pages[i]!;
      p.drawLine({
        start: { x: MARGIN_X, y: 40 },
        end: { x: CONTENT_RIGHT, y: 40 },
        thickness: 0.5,
        color: rule,
      });
      p.drawImage(this.logo, { x: MARGIN_X, y: 18, width: 12, height: 12 });
      p.drawText("TripLedger", {
        x: MARGIN_X + 18,
        y: 20,
        size: 8,
        font: this.font,
        color: muted,
      });
      p.drawText(`Page ${i + 1} of ${total}`, {
        x: CONTENT_RIGHT - 70,
        y: 20,
        size: 8,
        font: this.font,
        color: muted,
      });
    }
  }
}

export async function exportTripPdf(tripId: string): Promise<void> {
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

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(await loadBrandLogoPng());

  const doc = new PdfLetterhead(pdf, font, bold, logo, trip.name);
  doc.start();
  writeReport(doc, report);
  doc.finishFooters();

  const bytes = await pdf.save();
  const safe = trip.name.replace(/[^\w-]+/g, "_");
  saveAs(new Blob([bytes], { type: "application/pdf" }), `tripledger-${safe}.pdf`);
}

function asciiDiff(paisa: number): { label: string; color: RGB } {
  const abs = formatPkr(Math.abs(paisa));
  if (paisa > 0) return { label: `+${abs}`, color: ok };
  if (paisa < 0) return { label: `-${abs}`, color: danger };
  return { label: abs, color: textColor };
}

function writeReport(doc: PdfLetterhead, report: SettlementReport) {
  const colPerson = MARGIN_X;
  const col2 = 200;
  const col3 = 320;
  const col4 = 440;

  doc.text(report.tripName, { size: 18, bold: true });
  doc.text(
    `Total ${report.tripTotalLabel}  |  ${report.currency}  |  ${report.balancedLabel}`,
    { size: 10, color: muted },
  );
  doc.accentRule();
  doc.gap(4);

  doc.section("Expense List");
  if (report.expenses.length === 0) {
    doc.text("None", { size: 9, color: muted });
  } else {
    doc.tableHeader([
      { label: "Description", x: colPerson },
      { label: "Pool", x: col2 },
      { label: "Payer", x: col3 },
      { label: "Amount", x: col4 },
    ]);
    for (const e of report.expenses) {
      doc.row([
        { text: e.description.slice(0, 28), x: colPerson },
        { text: e.poolName.slice(0, 16), x: col2 },
        { text: e.payerName.slice(0, 14), x: col3 },
        { text: e.amountLabel, x: col4, bold: true },
      ]);
    }
  }

  doc.section("Payments");
  doc.tableHeader([
    { label: "Person", x: colPerson },
    { label: "Paid", x: col4 },
  ]);
  for (const p of report.payments) {
    doc.row([
      { text: p.displayName, x: colPerson },
      { text: p.paidLabel, x: col4 },
    ]);
  }
  doc.row([
    { text: "Total", x: colPerson, bold: true },
    { text: report.paymentsTotalLabel, x: col4, bold: true, color: teal },
  ]);

  for (const pool of report.pools) {
    doc.section(pool.name);
    doc.text(`Total: ${pool.totalLabel}`, { size: 9 });
    doc.text(pool.sharedAmongLabel, { size: 9, color: muted });
    if (pool.costPerUnitLabel) {
      doc.text(`Cost per person: ${pool.costPerUnitLabel}`, { size: 9 });
    }
    doc.tableHeader([
      { label: "Person", x: colPerson },
      { label: pool.weightColumn, x: col2 },
      { label: "Share", x: col4 },
    ]);
    for (const m of pool.members) {
      doc.row([
        { text: m.displayName, x: colPerson },
        { text: m.weightLabel, x: col2 },
        { text: m.shareLabel, x: col4 },
      ]);
    }
  }

  doc.section("Total each person should contribute");
  const poolCols = report.poolNames.slice(0, 3);
  doc.tableHeader([
    { label: "Person", x: colPerson },
    ...poolCols.map((name, i) => ({
      label: name.slice(0, 12),
      x: col2 + i * 90,
    })),
    { label: "Total Share", x: col4 },
  ]);
  for (const row of report.matrix) {
    doc.row([
      { text: row.displayName, x: colPerson },
      ...poolCols.map((name, i) => {
        const cell = row.cells.find((c) => c.poolName === name);
        return {
          text: !cell || cell.sharePaisa === 0 ? "-" : cell.shareLabel,
          x: col2 + i * 90,
        };
      }),
      { text: row.totalShareLabel, x: col4, bold: true },
    ]);
  }

  doc.section("Compare with actual payments");
  doc.tableHeader([
    { label: "Person", x: colPerson },
    { label: "Paid", x: col2 },
    { label: "Should Pay", x: col3 },
    { label: "Difference", x: col4 },
  ]);
  for (const c of report.compare) {
    const diff = asciiDiff(c.differencePaisa);
    doc.row([
      { text: c.displayName, x: colPerson },
      { text: c.paidLabel, x: col2 },
      { text: c.shouldPayLabel, x: col3 },
      { text: diff.label, x: col4, bold: true, color: diff.color },
    ]);
  }
  const checkAscii = toPdfSafeAscii(
    report.differenceChecksumLabel.replace(/[✓✔]/g, "OK"),
  );
  doc.text(`Check: ${checkAscii}`, { size: 9, color: muted });

  if (report.adjustments.length > 0) {
    doc.section("Adjustments");
    doc.tableHeader([
      { label: "Reason", x: colPerson },
      { label: "From", x: col2 },
      { label: "To", x: col3 },
      { label: "Amount", x: col4 },
    ]);
    for (const a of report.adjustments) {
      doc.row([
        { text: a.reason.slice(0, 26), x: colPerson },
        { text: a.fromName, x: col2 },
        { text: a.toName, x: col3 },
        { text: a.amountLabel, x: col4 },
      ]);
    }
  }

  doc.section("Final Settlement");
  if (report.transfers.length === 0) {
    doc.text("No transfers needed - everyone is settled.", { size: 10 });
  } else {
    doc.tableHeader([
      { label: "From", x: colPerson },
      { label: "To", x: col2 },
      { label: "Amount", x: col3 },
      { label: "Rounded", x: col4 },
    ]);
    for (const t of report.transfers) {
      doc.row([
        { text: t.fromName, x: colPerson, bold: true },
        { text: t.toName, x: col2, bold: true },
        { text: t.amountLabel, x: col3, bold: true, color: teal },
        { text: t.roundedLabel, x: col4, bold: true },
      ]);
    }
    doc.gap(4);
    doc.text("Rounded to the nearest rupee", { size: 9, bold: true, color: muted });
    for (const t of report.transfers) {
      doc.text(`${t.fromName} pays ${t.toName}: ${t.roundedLabel}`, {
        size: 10,
        bold: true,
      });
    }
  }
}
