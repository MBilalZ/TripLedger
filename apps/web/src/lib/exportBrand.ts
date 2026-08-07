/** TripLedger brand tokens for PDF / Excel letterheads. */
export const BRAND = {
  teal: "0F766E",
  tealLight: "CCFBF1",
  slate: "F1F5F9",
  text: "0F172A",
  muted: "64748B",
  white: "FFFFFF",
  ok: "16A34A",
  danger: "DC2626",
  border: "CBD5E1",
} as const;

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: Number.parseInt(h.slice(0, 2), 16) / 255,
    g: Number.parseInt(h.slice(2, 4), 16) / 255,
    b: Number.parseInt(h.slice(4, 6), 16) / 255,
  };
}

/** Load the public apple-touch-icon PNG for letterhead embedding. */
export async function loadBrandLogoPng(): Promise<Uint8Array> {
  const base = import.meta.env.BASE_URL ?? "/";
  const path = `${base.endsWith("/") ? base : `${base}/`}apple-touch-icon.png`;
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error("Failed to load TripLedger logo");
  }
  return new Uint8Array(await res.arrayBuffer());
}

/** Map common Unicode punctuation to Helvetica / WinAnsi-safe ASCII. */
export function toPdfSafeAscii(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\u2212|\u2013|\u2014|\u2015/g, "-")
    .replace(/\u2192|\u27A1|\u2794/g, "->")
    .replace(/\u2190/g, "<-")
    .replace(/\u2713|\u2714|\u2705/g, "OK")
    .replace(/\u2022|\u00B7/g, "-")
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/\u00A0/g, " ")
    .replace(/[^\x20-\x7E]/g, "")
    .slice(0, 240);
}
