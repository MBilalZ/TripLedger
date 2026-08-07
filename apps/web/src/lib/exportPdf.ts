import { formatPkr, settleTrip } from "@tripledger/engine";
import { saveAs } from "file-saver";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { db } from "@/db/dexie";
import { loadTripFacts } from "@/lib/tripFacts";
import {
  buildTripReport,
  type ChartSlice,
  type TripReport,
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
  const report = buildTripReport({
    tripName: trip.name,
    currency: trip.currency,
    settlement,
    expenses: facts.expenses,
    pools: facts.pools,
  });

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = MARGIN_TOP;

  /** WinAnsi-safe text for StandardFonts (drops unsupported glyphs). */
  const sanitize = (text: string) =>
    text
      .normalize("NFKD")
      .replace(/[^\x20-\x7E]/g, "?")
      .slice(0, 200);

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
  report: TripReport,
  line: (text: string, size?: number, useBold?: boolean) => void,
  gap: (px?: number) => void,
) {
  line("TripLedger", 18, true);
  line(report.tripName, 14, true);
  line(`Total ${report.tripTotalLabel} · ${report.currency}`);
  line(report.balancedLabel, 11, true);
  line(report.memberLabel);
  gap(12);

  line("Per friend", 13, true);
  if (report.participants.length === 0) {
    line("Add friends to see balances.", 10);
  } else {
    for (const p of report.participants) {
      line(`${p.displayName}: ${p.detailLine} · Bal ${p.balanceLabel}`, 10);
    }
  }
  gap(12);

  line("Suggested transfers", 13, true);
  if (report.transfers.length === 0) {
    line("No transfers needed — everyone is settled.", 10);
  } else {
    for (const t of report.transfers) {
      line(`${t.fromName} pays ${t.toName}: ${t.amountLabel}`, 10);
    }
  }
  gap(12);

  line("Charts", 13, true);
  writeChartSection("By pool", report.charts.byPool, line);
  gap(6);
  writeChartSection("By category", report.charts.byCategory, line);
  gap(6);
  writeChartSection("Paid by person", report.charts.byPersonPaid, line);
  gap(6);
  writeChartSection("Share by person", report.charts.byPersonShare, line);
}

function writeChartSection(
  title: string,
  slices: ChartSlice[],
  line: (text: string, size?: number, useBold?: boolean) => void,
) {
  line(title, 11, true);
  if (slices.length === 0) {
    line("None", 10);
    return;
  }
  for (const s of slices) {
    line(`${s.name}: ${formatPkr(s.paisa, 0)} · ${s.pct}%`, 10);
  }
}
