import { settleTrip } from "@tripledger/engine";
import { saveAs } from "file-saver";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { db } from "@/db/dexie";
import { loadTripFacts } from "@/lib/tripFacts";
import {
  buildSettlementReport,
  type SettlementReport,
} from "@/lib/tripReport";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 48;
const MARGIN_TOP = 800;
const MARGIN_BOTTOM = 48;

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

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = MARGIN_TOP;

  const sanitize = (text: string) =>
    text
      .normalize("NFKD")
      .replace(/[^\x20-\x7E]/g, "?")
      .slice(0, 220);

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN_BOTTOM) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = MARGIN_TOP;
    }
  };

  const line = (text: string, size = 11, useBold = false) => {
    ensureSpace(size + 6);
    try {
      page.drawText(sanitize(text), {
        x: MARGIN_X,
        y,
        size,
        font: useBold ? bold : font,
        color: rgb(0.1, 0.12, 0.16),
      });
    } catch {
      page.drawText("?", {
        x: MARGIN_X,
        y,
        size,
        font,
        color: rgb(0.1, 0.12, 0.16),
      });
    }
    y -= size + 6;
  };

  const gap = (px = 8) => {
    y -= px;
  };

  writeReport(report, line, gap);

  const bytes = await pdf.save();
  const safe = trip.name.replace(/[^\w-]+/g, "_");
  saveAs(new Blob([bytes], { type: "application/pdf" }), `tripledger-${safe}.pdf`);
}

function writeReport(
  report: SettlementReport,
  line: (text: string, size?: number, useBold?: boolean) => void,
  gap: (px?: number) => void,
) {
  line("Expense Settlement Summary", 16, true);
  line(report.tripName, 13, true);
  line(`Total Trip Expense: ${report.tripTotalLabel}`);
  line(report.balancedLabel, 11, true);
  gap(10);

  line("Expense List", 13, true);
  if (report.expenses.length === 0) {
    line("None", 10);
  } else {
    for (const e of report.expenses) {
      line(
        `${e.description}: ${e.amountLabel} (${e.poolName} / ${e.payerName})`,
        9,
      );
    }
  }
  gap(10);

  line("1. Payments", 13, true);
  for (const p of report.payments) {
    line(`${p.displayName}: ${p.paidLabel}`, 10);
  }
  line(`Total: ${report.paymentsTotalLabel}`, 10, true);
  gap(10);

  for (const pool of report.pools) {
    line(pool.name, 13, true);
    line(`Total: ${pool.totalLabel}`, 10);
    line(pool.sharedAmongLabel, 10);
    for (const m of pool.members) {
      line(`  ${m.displayName}: ${m.weightLabel} -> ${m.shareLabel}`, 9);
    }
    if (pool.costPerUnitLabel) {
      line(`Cost per person: ${pool.costPerUnitLabel}`, 10);
    }
    gap(8);
  }

  line("Total each person should contribute", 13, true);
  for (const row of report.matrix) {
    const parts = row.cells
      .filter((c) => c.sharePaisa > 0)
      .map((c) => `${c.poolName} ${c.shareLabel}`)
      .join(" | ");
    line(`${row.displayName}: ${parts} = ${row.totalShareLabel}`, 9);
  }
  gap(10);

  line("Compare with actual payments", 13, true);
  for (const c of report.compare) {
    line(
      `${c.displayName}: Paid ${c.paidLabel} | Should ${c.shouldPayLabel} | Diff ${c.differenceLabel}`,
      9,
    );
  }
  line(`Check: ${report.differenceChecksumLabel}`, 9);
  gap(10);

  if (report.adjustments.length > 0) {
    line("Adjustments", 13, true);
    for (const a of report.adjustments) {
      line(`${a.reason}: ${a.fromName} -> ${a.toName} ${a.amountLabel}`, 9);
    }
    gap(10);
  }

  line("Final Settlement", 13, true);
  if (report.transfers.length === 0) {
    line("No transfers needed — everyone is settled.", 10);
  } else {
    for (const t of report.transfers) {
      line(`${t.fromName} -> ${t.toName}: ${t.amountLabel}`, 10);
    }
    gap(6);
    line("Rounded to the nearest rupee", 11, true);
    for (const t of report.transfers) {
      line(`${t.fromName} pays ${t.toName}: ${t.roundedLabel}`, 10);
    }
  }
}
