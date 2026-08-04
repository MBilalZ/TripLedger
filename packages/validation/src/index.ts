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

const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
const MAX_TRIPS_IN_BACKUP = 50;
const MAX_ROWS_PER_COLLECTION = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid backup: ${field} must be a non-empty string`);
  }
  return value;
}

function assertArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid backup: ${field} must be an array`);
  }
  if (value.length > MAX_ROWS_PER_COLLECTION) {
    throw new Error(
      `Invalid backup: ${field} has too many rows (max ${MAX_ROWS_PER_COLLECTION})`,
    );
  }
  return value;
}

function assertTripExportShape(data: unknown, label: string): void {
  if (!isRecord(data)) {
    throw new Error(`Invalid backup: ${label} must be an object`);
  }
  const version = data.version;
  if (version !== 1 && version !== 2) {
    throw new Error(`Invalid backup: ${label} version must be 1 or 2`);
  }
  if (!isRecord(data.trip)) {
    throw new Error(`Invalid backup: ${label} trip is required`);
  }
  assertString(data.trip.id, `${label}.trip.id`);
  assertString(data.trip.name, `${label}.trip.name`);
  assertArray(data.participants ?? [], `${label}.participants`);
  assertArray(data.pools ?? [], `${label}.pools`);
  assertArray(data.poolMembers ?? [], `${label}.poolMembers`);
  assertArray(data.expenses ?? [], `${label}.expenses`);
  assertArray(data.expenseSplits ?? [], `${label}.expenseSplits`);
  assertArray(data.adjustments ?? [], `${label}.adjustments`);

  for (const [i, p] of (data.participants as unknown[]).entries()) {
    if (!isRecord(p)) throw new Error(`Invalid backup: participant[${i}]`);
    assertString(p.id, `participant[${i}].id`);
    assertString(p.displayName, `participant[${i}].displayName`);
  }
  for (const [i, e] of ((data.expenses as unknown[]) ?? []).entries()) {
    if (!isRecord(e)) throw new Error(`Invalid backup: expense[${i}]`);
    assertString(e.id, `expense[${i}].id`);
    if (typeof e.amountPaisa !== "number" || !Number.isFinite(e.amountPaisa)) {
      throw new Error(`Invalid backup: expense[${i}].amountPaisa`);
    }
  }
}

/**
 * Validate TripLedger JSON before writing to IndexedDB.
 * Accepts a single trip export or a full backup (`trips` array).
 */
export function assertBackupPayload(
  text: string,
): Record<string, unknown> {
  if (typeof text !== "string") {
    throw new Error("Invalid backup: expected JSON text");
  }
  if (text.length > MAX_BACKUP_BYTES) {
    throw new Error(
      `Backup file is too large (max ${MAX_BACKUP_BYTES / (1024 * 1024)} MB)`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Invalid backup: file is not valid JSON");
  }

  if (!isRecord(parsed)) {
    throw new Error("Invalid backup: root must be an object");
  }

  if ("trips" in parsed) {
    const trips = assertArray(parsed.trips, "trips");
    if (trips.length === 0) {
      throw new Error("Invalid backup: trips array is empty");
    }
    if (trips.length > MAX_TRIPS_IN_BACKUP) {
      throw new Error(
        `Invalid backup: too many trips (max ${MAX_TRIPS_IN_BACKUP})`,
      );
    }
    const version = parsed.version;
    if (version !== 1 && version !== 2) {
      throw new Error("Invalid backup: version must be 1 or 2");
    }
    for (const [i, trip] of trips.entries()) {
      assertTripExportShape(trip, `trips[${i}]`);
    }
    return parsed;
  }

  assertTripExportShape(parsed, "export");
  return parsed;
}
