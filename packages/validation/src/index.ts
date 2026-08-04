/** Shared input guards used by the UI. Engine also validates on settle. */

export function parseRupeesToPaisa(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Amount must be a number");
  const paisa = Math.round(value * 100);
  if (paisa <= 0) throw new Error("Amount must be greater than zero");
  return paisa;
}

export function assertHeadCount(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("Head count must be an integer >= 0");
  }
  return value;
}
