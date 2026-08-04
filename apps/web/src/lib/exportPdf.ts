import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { saveAs } from "file-saver";
import { paisaToRupees, settleTrip } from "@tripledger/engine";
import { loadTripFacts } from "@/lib/tripFacts";
import { db } from "@/db/dexie";

export async function exportTripPdf(tripId: string): Promise<void> {
  const trip = await db.trips.get(tripId);
  if (!trip) throw new Error("Trip not found");
  const result = settleTrip(await loadTripFacts(tripId));

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = 800;

  const line = (text: string, size = 11, useBold = false) => {
    page.drawText(text, {
      x: 48,
      y,
      size,
      font: useBold ? bold : font,
      color: rgb(0.1, 0.12, 0.16),
    });
    y -= size + 6;
  };

  line("TripLedger Settlement", 18, true);
  line(trip.name, 14, true);
  line(`Trip Total: Rs. ${paisaToRupees(result.summary.tripTotalPaisa).toLocaleString("en-PK")}`);
  line(`Balanced: ${result.consistency.ok ? "YES" : "NO"}`, 11, true);
  y -= 8;
  line("Who Pays Whom", 13, true);
  if (result.settlements.length === 0) {
    line("Nothing to settle.");
  } else {
    for (const t of result.settlements) {
      line(
        `${t.fromName} → ${t.toName}: Rs. ${Math.round(t.amountRupees).toLocaleString("en-PK")}`,
      );
    }
  }

  y -= 12;
  line("Per Person", 13, true);
  for (const p of result.participants) {
    line(
      `${p.displayName}: Paid ${paisaToRupees(p.paidPaisa).toFixed(0)} | Share ${paisaToRupees(p.sharePaisa).toFixed(2)} | Bal ${paisaToRupees(p.balancePaisa).toFixed(2)}`,
      10,
    );
  }

  const bytes = await pdf.save();
  const safe = trip.name.replace(/[^\w\-]+/g, "_");
  saveAs(
    new Blob([bytes], { type: "application/pdf" }),
    `tripledger-${safe}.pdf`,
  );
}
